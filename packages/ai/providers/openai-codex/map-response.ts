import type {
	Response,
	ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type {
	CreateUnifiedResponseStreamResult,
	ProviderMetadata,
	ResponseContentPart,
	ResponseFinishReason,
	ResponseTextPart,
	ResponseToolCallPart,
	RunStatus,
	UnifiedResponse,
	Usage,
} from "../../types.ts";

export type Accumulator = {
	internal: {
		rawCompletedResponse?: unknown;
	};
	text: string;
	content: ResponseContentPart[];
	toolCalls: ResponseToolCallPart[];
	usage?: Usage;
	finishReason: ResponseFinishReason;
	providerMetadata: ProviderMetadata;
	warnings: string[];
	toolArgumentsByItemId: Record<string, string>;
	completed: boolean;
};

function usagemap(u: NonNullable<Response["usage"]>): Usage {
	const input = u.input_tokens ?? 0;
	const output = u.output_tokens ?? 0;
	const total = u.total_tokens ?? input + output;
	const cached = u.input_tokens_details?.cached_tokens ?? 0;
	return {
		input,
		output,
		cacheRead: cached,
		cacheWrite: 0,
		totalTokens: total,
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			total: 0,
		},
	};
}

function finishReasonFromCompleted(response: Response): ResponseFinishReason {
	if (response.error) return "error";
	const incomplete = response.incomplete_details;
	if (incomplete && typeof incomplete === "object") {
		const reason = (incomplete as { reason?: string }).reason;
		if (reason === "max_output_tokens") return "length";
	}
	if (response.status === "incomplete") return "length";
	return "stop";
}

function runStatusFromFinishReason(
	finishReason: ResponseFinishReason,
): RunStatus {
	switch (finishReason) {
		case "error":
			return "failed";
		case "abort":
			return "aborted";
		default:
			return "completed";
	}
}

export function parseToolCallItem(
	item: unknown,
): ResponseToolCallPart | undefined {
	if (!item || typeof item !== "object") {
		return undefined;
	}

	const value = item as {
		id?: unknown;
		type?: unknown;
		name?: unknown;
		call_id?: unknown;
		arguments?: unknown;
	};

	if (
		value.type !== "function_call" ||
		typeof value.id !== "string" ||
		typeof value.name !== "string"
	) {
		return undefined;
	}

	let parsedArguments: unknown = value.arguments;
	if (typeof value.arguments === "string") {
		try {
			parsedArguments = JSON.parse(value.arguments);
		} catch {
			parsedArguments = value.arguments;
		}
	}

	return {
		type: "tool-call",
		id: value.id,
		...(typeof value.call_id === "string" ? { callId: value.call_id } : {}),
		name: value.name,
		arguments: parsedArguments,
	};
}

/**
 * This parses tool arguments from provider events when they arrive as strings.
 */
function parseToolArguments(value: unknown): unknown {
	if (typeof value !== "string") {
		return value;
	}

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

/**
 * This adds or replaces one tool call entry in the accumulator arrays.
 */
function upsertToolCall(
	state: Accumulator,
	toolCall: ResponseToolCallPart,
): Accumulator {
	const replaceById = (part: ResponseContentPart): ResponseContentPart =>
		part.type === "tool-call" && part.id === toolCall.id ? toolCall : part;

	const hasContentEntry = state.content.some(
		(part) => part.type === "tool-call" && part.id === toolCall.id,
	);
	const hasToolCallEntry = state.toolCalls.some(
		(part) => part.id === toolCall.id,
	);

	return {
		...state,
		content: hasContentEntry
			? state.content.map(replaceById)
			: [...state.content, toolCall],
		toolCalls: hasToolCallEntry
			? state.toolCalls.map((part) =>
					part.id === toolCall.id ? toolCall : part,
				)
			: [...state.toolCalls, toolCall],
	};
}

export function emptyAccumulator(): Accumulator {
	return {
		internal: {},
		text: "",
		content: [],
		toolCalls: [],
		finishReason: "error",
		providerMetadata: { provider: "openai-codex" },
		warnings: [],
		toolArgumentsByItemId: {},
		completed: false,
	};
}

export function mapChunk(
	state: Accumulator,
	event: ResponseStreamEvent,
	stream?: CreateUnifiedResponseStreamResult["controller"],
): Accumulator {
	switch (event.type) {
		case "response.created": {
			const r = event.response;
			return {
				...state,
				finishReason: "stop",
				providerMetadata: {
					...state.providerMetadata,
					provider: "openai-codex",
					responseId: r.id,
					...(r.model ? { model: r.model } : {}),
				},
			};
		}
		case "response.in_progress":
			return state;
		case "response.output_item.added": {
			const item = event.item;
			if (item.type === "message") {
				return {
					...state,
					providerMetadata: {
						...state.providerMetadata,
						messageId: item.id,
					},
				};
			}
			const toolCall = parseToolCallItem(item);
			if (toolCall) {
				return upsertToolCall(state, toolCall);
			}
			return state;
		}
		case "response.function_call_arguments.delta": {
			const itemId =
				"item_id" in event && typeof event.item_id === "string"
					? event.item_id
					: undefined;
			if (!itemId) {
				return state;
			}

			const delta =
				"delta" in event && typeof event.delta === "string" ? event.delta : "";

			return {
				...state,
				toolArgumentsByItemId: {
					...state.toolArgumentsByItemId,
					[itemId]: `${state.toolArgumentsByItemId[itemId] ?? ""}${delta}`,
				},
			};
		}
		case "response.content_part.added":
			return state;
		case "response.output_text.delta": {
			stream?.pushText(event.delta);
			return { ...state, text: state.text + event.delta };
		}
		case "response.output_text.done":
			return state;
		case "response.content_part.done":
			return state;
		case "response.function_call_arguments.done": {
			const itemId =
				"item_id" in event && typeof event.item_id === "string"
					? event.item_id
					: undefined;
			const argumentsText =
				"arguments" in event && typeof event.arguments === "string"
					? event.arguments
					: itemId
						? state.toolArgumentsByItemId[itemId]
						: undefined;

			if (!itemId || argumentsText === undefined) {
				return state;
			}

			const existing = state.toolCalls.find((part) => part.id === itemId);
			if (!existing) {
				return state;
			}

			return upsertToolCall(state, {
				...existing,
				arguments: parseToolArguments(argumentsText),
			});
		}
		case "response.output_item.done": {
			const toolCall = parseToolCallItem(event.item);
			if (!toolCall) {
				return state;
			}

			const bufferedArguments = state.toolArgumentsByItemId[toolCall.id];
			return upsertToolCall(state, {
				...toolCall,
				arguments:
					bufferedArguments !== undefined
						? parseToolArguments(bufferedArguments)
						: toolCall.arguments,
			});
		}
		case "response.completed": {
			const r = event.response;
			const nextState = {
				...state,
				internal: { ...state.internal, rawCompletedResponse: event },
				...(r.usage !== undefined && r.usage !== null
					? { usage: usagemap(r.usage) }
					: {}),
				finishReason: finishReasonFromCompleted(r),
				completed: true,
				providerMetadata: {
					...state.providerMetadata,
					responseId: r.id,
					model: r.model ?? state.providerMetadata.model,
				},
			};
			stream?.complete(toUnifiedSnapshot(nextState));
			return nextState;
		}
		default:
			return state;
	}
}

export function toUnifiedSnapshot(acc: Accumulator): UnifiedResponse {
	const textParts: ResponseContentPart[] = acc.text.length
		? [{ type: "text", text: acc.text } satisfies ResponseTextPart]
		: [];
	const content = [
		...textParts,
		...acc.content.filter((part) => part.type !== "text"),
	];
	return {
		status: acc.completed
			? runStatusFromFinishReason(acc.finishReason)
			: "in_progress",
		...(acc.text.length > 0 ? { text: acc.text } : {}),
		content,
		toolCalls: acc.toolCalls,
		approvals: [],
		...(acc.usage ? { usage: acc.usage } : {}),
		...(acc.finishReason ? { finishReason: acc.finishReason } : {}),
		...(acc.providerMetadata ? { providerMetadata: acc.providerMetadata } : {}),
		warnings: acc.warnings,
		...(acc.finishReason === "error" ? { errorMessage: "Run failed" } : {}),
	};
}
