import {
	appendAssistantFromUnifiedResponse,
	toolExecutionToMessage,
} from "../history/from-unified-response.ts";
import type { appRequestShape } from "../providers/openai-codex/types.ts";
import type {
	ToolResultMessage,
	UnifiedResponse,
	UnifiedStreamEventType,
	message,
} from "../types.ts";
import { generate } from "./generate.ts";

const DEFAULT_MAX_ITERATIONS = 10;

/**
 * This is one completed turn in the agent loop.
 * It holds the assistant response and any tool results executed locally in that turn.
 * The final stop turn always has an empty toolResults array.
 */
export type RunTurnEvent = {
	/** Zero-based index of this turn in the loop. */
	iteration: number;
	/** The completed assistant response for this turn. */
	response: UnifiedResponse;
	/** Tool results that were executed and appended this turn. Empty on the final stop turn. */
	toolResults: ToolResultMessage[];
};

/**
 * This is the options shape for run().
 * endpoint and maxIterations control the loop; onTurn lets you observe each completed turn.
 */
export type RunOptions = {
	/** Bridge endpoint, e.g. http://127.0.0.1:4318/v1/generate */
	endpoint: string;
	/** Extra HTTP headers forwarded to every generate() call in the loop. */
	headers?: Record<string, string>;
	/**
	 * Hard cap on how many generate() calls the loop will make.
	 * Prevents infinite tool loops when the model keeps requesting tools.
	 * Default: 10.
	 */
	maxIterations?: number;
	/**
	 * Called after each turn completes (assistant response received, tools executed, results appended).
	 * Use this to log intermediate steps or update a status indicator.
	 * For streaming runs, prefer consuming run_turn_end events on the events iterable instead.
	 */
	onTurn?: (turn: RunTurnEvent) => void | Promise<void>;
};

/**
 * This is what batch run() returns when the agent loop finishes (stream: false).
 * It holds the final response, the complete message history, the iteration count, and stream: false.
 */
export type RunResult = {
	/** The final UnifiedResponse — the last assistant turn with a non-tool-call stop reason. */
	response: UnifiedResponse;
	/**
	 * Full conversation history including every assistant and tool turn added during the loop.
	 * Starts from request.messages and grows on every iteration.
	 * Pass this back into the next run() or generate() call to continue the conversation.
	 */
	messages: message[];
	/** Total number of generate() HTTP calls made during the loop. */
	iterations: number;
};

// ---------------------------------------------------------------------------
// Streaming run event types
// ---------------------------------------------------------------------------

/**
 * This fires at the start of each generate() call within the loop.
 * Use it to show a "thinking…" indicator for each new turn.
 */
export type RunTurnStartEvent = {
	type: "run_turn_start";
	/** Zero-based turn index. */
	iteration: number;
};

/**
 * This fires just before a tool's execute() function is called locally.
 * Use it to show "running grep…" or similar in the UI before the result arrives.
 */
export type RunToolExecutingEvent = {
	type: "run_tool_executing";
	iteration: number;
	toolName: string;
	toolCallId: string;
	/** The decoded arguments the model passed to the tool. */
	arguments: unknown;
};

/**
 * This fires after a tool's execute() function completes (or errors).
 * Use it to display the tool result or error inline in the UI.
 */
export type RunToolExecutedEvent = {
	type: "run_tool_executed";
	iteration: number;
	toolName: string;
	toolCallId: string;
	result: unknown;
	isError: boolean;
};

/**
 * This fires at the end of each turn after all tools for that turn have been executed.
 * Carries the full assistant response and all tool results for the turn.
 */
export type RunTurnEndEvent = {
	type: "run_turn_end";
	iteration: number;
	response: UnifiedResponse;
	toolResults: ToolResultMessage[];
};

/**
 * This fires once when the entire run loop finishes.
 * Carries the final response and full message history — same as RunResult.
 */
export type RunCompleteEvent = {
	type: "run_complete";
	response: UnifiedResponse;
	messages: message[];
	iterations: number;
};

/**
 * This is the full event union that a streaming run() emits.
 * Includes every UnifiedStreamEvent from each underlying generate() stream,
 * plus lifecycle events added by the run loop itself (run_turn_start, run_tool_*, run_turn_end, run_complete).
 */
export type RunStreamEvent =
	| UnifiedStreamEventType
	| RunTurnStartEvent
	| RunToolExecutingEvent
	| RunToolExecutedEvent
	| RunTurnEndEvent
	| RunCompleteEvent;

/**
 * This is what streaming run() returns (stream: true).
 * Consume events to drive UI updates across all turns.
 * Call final() to get the complete RunResult when the loop is done.
 */
export type RunStreamingResult = {
	stream: true;
	/**
	 * All events from every generate() turn plus run-loop lifecycle events, in order.
	 * Iterate with `for await (const event of result.events)`.
	 */
	events: AsyncIterable<RunStreamEvent>;
	/**
	 * Resolves with the full RunResult when the loop completes.
	 * The same data is also carried by the terminal run_complete event on the events iterable.
	 */
	final(): Promise<RunResult>;
};

// ---------------------------------------------------------------------------
// Batch run (stream: false)
// ---------------------------------------------------------------------------

async function runBatch(
	request: appRequestShape & { stream: false },
	options: RunOptions,
): Promise<RunResult> {
	const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
	let messages: message[] = [...request.messages];
	let iterations = 0;
	let lastResponse: UnifiedResponse | undefined;

	while (iterations < maxIterations) {
		if (request.signal?.aborted) {
			break;
		}

		const batchRequest: appRequestShape & { stream: false } = {
			...request,
			messages,
			stream: false,
		};

		const result = await generate(batchRequest, {
			endpoint: options.endpoint,
			...(options.headers !== undefined ? { headers: options.headers } : {}),
		});

		iterations++;
		const response = result.response;
		lastResponse = response;

		messages = appendAssistantFromUnifiedResponse(messages, response, {
			provider: "openai-codex",
		});

		const isToolCallTurn =
			response.toolCalls.length > 0 && response.finishReason === "tool-call";

		if (!isToolCallTurn) {
			await options.onTurn?.({
				iteration: iterations - 1,
				response,
				toolResults: [],
			});
			break;
		}

		const toolResults = await executeTools(
			response,
			request.tools ?? [],
			iterations - 1,
		);

		for (const toolResult of toolResults) {
			messages.push(toolResult);
		}

		await options.onTurn?.({
			iteration: iterations - 1,
			response,
			toolResults,
		});
	}

	if (lastResponse === undefined) {
		throw new Error(
			"run() completed without any response — check that messages is non-empty and the endpoint is reachable.",
		);
	}

	return { response: lastResponse, messages, iterations };
}

// ---------------------------------------------------------------------------
// Streaming run (stream: true)
// ---------------------------------------------------------------------------

function runStreaming(
	request: appRequestShape & { stream: true },
	options: RunOptions,
): RunStreamingResult {
	const eventQueue: RunStreamEvent[] = [];
	type Waiter = {
		resolve: (v: IteratorResult<RunStreamEvent>) => void;
		reject: (e: unknown) => void;
	};
	const waiters: Waiter[] = [];
	let closed = false;
	let pumpError: unknown;

	let finalResolve!: (result: RunResult) => void;
	let finalReject!: (err: unknown) => void;
	const finalPromise = new Promise<RunResult>((res, rej) => {
		finalResolve = res;
		finalReject = rej;
	});

	const push = (event: RunStreamEvent) => {
		const waiter = waiters.shift();
		if (waiter !== undefined) {
			waiter.resolve({ value: event, done: false });
		} else {
			eventQueue.push(event);
		}
	};

	const closeEvents = (err?: unknown) => {
		if (closed) {
			return;
		}
		closed = true;
		pumpError = err;
		while (waiters.length > 0) {
			const waiter = waiters.shift();
			if (waiter === undefined) {
				break;
			}
			if (err !== undefined) {
				waiter.reject(err);
			} else {
				waiter.resolve({
					value: undefined as unknown as RunStreamEvent,
					done: true,
				});
			}
		}
	};

	void (async () => {
		try {
			const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
			let messages: message[] = [...request.messages];
			let iterations = 0;
			let lastResponse: UnifiedResponse | undefined;

			while (iterations < maxIterations) {
				if (request.signal?.aborted) {
					break;
				}

				push({ type: "run_turn_start", iteration: iterations });

				const streamRequest: appRequestShape & { stream: true } = {
					...request,
					messages,
					stream: true,
				};

				const turnResult = await generate(streamRequest, {
					endpoint: options.endpoint,
					...(options.headers !== undefined
						? { headers: options.headers }
						: {}),
				});

				// Forward every event from this turn's stream to the caller.
				for await (const event of turnResult.events) {
					push(event);
				}

				const response = await turnResult.final();
				lastResponse = response;
				iterations++;

				messages = appendAssistantFromUnifiedResponse(messages, response, {
					provider: "openai-codex",
				});

				const isToolCallTurn =
					response.toolCalls.length > 0 &&
					response.finishReason === "tool-call";

				const toolResults: ToolResultMessage[] = [];

				if (isToolCallTurn) {
					const tools = request.tools ?? [];

					for (const call of response.toolCalls) {
						const toolCallId = call.callId ?? call.id;

						push({
							type: "run_tool_executing",
							iteration: iterations - 1,
							toolName: call.name,
							toolCallId,
							arguments: call.arguments,
						});

						const toolDef = tools.find((t) => t.name === call.name);
						let result: unknown;
						let isError = false;

						if (typeof toolDef?.execute !== "function") {
							result = `Tool "${call.name}" has no execute function registered.`;
							isError = true;
						} else {
							try {
								result = await (
									toolDef.execute as (input: unknown) => Promise<unknown>
								)(call.arguments);
							} catch (err) {
								result = err instanceof Error ? err.message : String(err);
								isError = true;
							}
						}

						push({
							type: "run_tool_executed",
							iteration: iterations - 1,
							toolName: call.name,
							toolCallId,
							result,
							isError,
						});

						const toolMsg = toolExecutionToMessage({
							toolCallId,
							toolName: call.name,
							result,
							isError,
						});
						toolResults.push(toolMsg);
						messages.push(toolMsg);
					}
				}

				push({
					type: "run_turn_end",
					iteration: iterations - 1,
					response,
					toolResults,
				});
				await options.onTurn?.({
					iteration: iterations - 1,
					response,
					toolResults,
				});

				if (!isToolCallTurn) {
					break;
				}
			}

			if (lastResponse === undefined) {
				throw new Error(
					"run() streaming loop completed without any response — check that messages is non-empty.",
				);
			}

			const finalResult: RunResult = {
				response: lastResponse,
				messages,
				iterations,
			};

			push({ type: "run_complete", ...finalResult });
			finalResolve(finalResult);
		} catch (err) {
			finalReject(err);
			closeEvents(err);
			return;
		}

		closeEvents();
	})();

	const events: AsyncIterable<RunStreamEvent> = {
		[Symbol.asyncIterator](): AsyncIterator<RunStreamEvent> {
			return {
				async next(): Promise<IteratorResult<RunStreamEvent>> {
					if (pumpError !== undefined) {
						throw pumpError;
					}
					if (eventQueue.length > 0) {
						return {
							value: eventQueue.shift() as RunStreamEvent,
							done: false,
						};
					}
					if (closed) {
						return {
							value: undefined as unknown as RunStreamEvent,
							done: true,
						};
					}
					return new Promise<IteratorResult<RunStreamEvent>>(
						(resolve, reject) => {
							waiters.push({ resolve, reject });
						},
					);
				},
			};
		},
	};

	return { stream: true, events, final: () => finalPromise };
}

// ---------------------------------------------------------------------------
// Shared tool execution helper
// ---------------------------------------------------------------------------

async function executeTools(
	response: UnifiedResponse,
	tools: NonNullable<appRequestShape["tools"]>,
	iteration: number,
): Promise<ToolResultMessage[]> {
	const results: ToolResultMessage[] = [];

	for (const call of response.toolCalls) {
		const toolDef = tools.find((t) => t.name === call.name);
		const toolCallId = call.callId ?? call.id;

		if (typeof toolDef?.execute !== "function") {
			results.push(
				toolExecutionToMessage({
					toolCallId,
					toolName: call.name,
					result: `Tool "${call.name}" has no execute function registered.`,
					isError: true,
				}),
			);
			continue;
		}

		try {
			const output = await (
				toolDef.execute as (input: unknown) => Promise<unknown>
			)(call.arguments);
			results.push(
				toolExecutionToMessage({
					toolCallId,
					toolName: call.name,
					result: output,
					isError: false,
				}),
			);
		} catch (err) {
			results.push(
				toolExecutionToMessage({
					toolCallId,
					toolName: call.name,
					result: err instanceof Error ? err.message : String(err),
					isError: true,
				}),
			);
		}
	}

	void iteration;
	return results;
}

// ---------------------------------------------------------------------------
// Public overloaded run()
// ---------------------------------------------------------------------------

/**
 * This runs the full agent loop with streaming: generate → stream events → execute tools →
 * append results → generate again. All events from every turn are forwarded through one
 * unified events iterable, along with run-loop lifecycle events (run_turn_start,
 * run_tool_executing, run_tool_executed, run_turn_end, run_complete).
 *
 * Use the events iterable to drive UI updates — show text as it streams in, show tool
 * calls as they happen, and show tool results as they complete. Call final() to get
 * the full RunResult when the loop finishes.
 */
export function run(
	request: appRequestShape & { stream: true },
	options: RunOptions,
): Promise<RunStreamingResult>;

/**
 * This runs the full agent loop without streaming: generate → execute tools → append results →
 * generate again. Each turn completes fully before the next starts.
 * Use onTurn to observe intermediate turns.
 */
export function run(
	request: appRequestShape & { stream: false },
	options: RunOptions,
): Promise<RunResult>;

export function run(
	request: appRequestShape,
	options: RunOptions,
): Promise<RunStreamingResult | RunResult>;

export async function run(
	request: appRequestShape,
	options: RunOptions,
): Promise<RunStreamingResult | RunResult> {
	if (request.stream) {
		return runStreaming(request as appRequestShape & { stream: true }, options);
	}

	return runBatch(request as appRequestShape & { stream: false }, options);
}
