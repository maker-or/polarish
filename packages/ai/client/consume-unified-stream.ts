import { unifiedStreamDoneReason } from "../providers/openai-codex/stream-events.ts";
import { unifiedResponseForStreamError } from "../runtime/unified-response-error.ts";
import { createUnifiedResponseStream } from "../runtime/unified-response-stream.ts";
import type {
	UnifiedResponse,
	UnifiedResponseStreamController,
	UnifiedResponseStreamingResult,
	UnifiedStreamEventType,
} from "../types.ts";

type UnifiedSseFrame = {
	event: string;
	data: string;
};

/**
 * This turns a machine streaming `fetch` `Response` into `textStream`, `final()`, and a pi-mono-style `events` async iterator.
 */
export function consumeUnifiedStream(
	response: Response,
): UnifiedResponseStreamingResult {
	const stream = createUnifiedResponseStream();
	const eventQueue: UnifiedStreamEventType[] = [];
	type EventWaiter = {
		resolve: (value: IteratorResult<UnifiedStreamEventType>) => void;
		reject: (cause: unknown) => void;
	};
	const eventWaiters: EventWaiter[] = [];
	let eventsClosed = false;
	let pumpError: unknown;

	const pushStreamEvent = (event: UnifiedStreamEventType) => {
		const waiter = eventWaiters.shift();
		if (waiter !== undefined) {
			waiter.resolve({ value: event, done: false });
		} else {
			eventQueue.push(event);
		}
	};

	const closeStreamEvents = () => {
		if (eventsClosed) {
			return;
		}
		eventsClosed = true;
		while (eventWaiters.length > 0) {
			const waiter = eventWaiters.shift();
			if (waiter === undefined) {
				break;
			}
			if (pumpError !== undefined) {
				waiter.reject(pumpError);
			} else {
				waiter.resolve({ value: undefined, done: true });
			}
		}
	};

	void processUnifiedStream(
		response,
		stream.controller,
		pushStreamEvent,
		closeStreamEvents,
		(cause) => {
			pumpError = cause;
		},
	);

	const events: AsyncIterable<UnifiedStreamEventType> = {
		[Symbol.asyncIterator](): AsyncIterator<UnifiedStreamEventType> {
			return {
				async next(): Promise<IteratorResult<UnifiedStreamEventType>> {
					if (pumpError !== undefined) {
						throw pumpError;
					}
					if (eventQueue.length > 0) {
						return {
							value: eventQueue.shift() as UnifiedStreamEventType,
							done: false,
						};
					}
					if (eventsClosed) {
						return { value: undefined, done: true };
					}
					return await new Promise<IteratorResult<UnifiedStreamEventType>>(
						(resolve, reject) => {
							eventWaiters.push({ resolve, reject });
						},
					);
				},
			};
		},
	};

	return {
		...stream.result,
		events,
	};
}

async function processUnifiedStream(
	response: Response,
	controller: UnifiedResponseStreamController,
	onStreamEvent: (event: UnifiedStreamEventType) => void,
	onEventsClosed: () => void,
	onPumpError: (cause: unknown) => void,
): Promise<void> {
	try {
		await assertReadableResponse(response);
		const body = response.body;
		if (body === null) {
			throw new Error("Streaming response body is missing");
		}

		for await (const frame of parseUnifiedSse(body)) {
			const parsed = unifiedEventFromFrame(frame);
			if (parsed === undefined) {
				continue;
			}
			onStreamEvent(parsed);
			applyUnifiedStreamEvent(parsed, controller);
		}
	} catch (cause) {
		controller.error(cause);
		onPumpError(cause);
	} finally {
		onEventsClosed();
	}
}

async function* parseUnifiedSse(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<UnifiedSseFrame, void, void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	const parseFrame = (rawFrame: string): UnifiedSseFrame | undefined => {
		const frame = rawFrame.replace(/\r\n/g, "\n");
		const lines = frame.split("\n");
		let event = "message";
		const dataLines: string[] = [];

		for (const line of lines) {
			if (line.startsWith("event:")) {
				event = line.slice(6).trim();
			} else if (line.startsWith("data:")) {
				dataLines.push(line.slice(5).trim());
			}
		}

		if (dataLines.length === 0) {
			return undefined;
		}

		const data = dataLines.join("\n");
		if (data === "[DONE]") {
			return undefined;
		}

		return { event, data };
	};

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });

			while (true) {
				const separatorIndex = buffer.indexOf("\n\n");
				if (separatorIndex === -1) {
					break;
				}

				const rawFrame = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + 2);

				const parsed = parseFrame(rawFrame);
				if (parsed !== undefined) {
					yield parsed;
				}
			}
		}

		buffer += decoder.decode();
		const trailingFrame = buffer.trim();
		if (trailingFrame.length > 0) {
			const parsed = parseFrame(trailingFrame);
			if (parsed !== undefined) {
				yield parsed;
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * This maps one SSE frame to a unified stream payload when the `data` line is JSON with a `type` field, or handles legacy `text` / `final` frames.
 */
function unifiedEventFromFrame(
	frame: UnifiedSseFrame,
): UnifiedStreamEventType | undefined {
	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(frame.data);
	} catch {
		return undefined;
	}

	if (frame.event === "text") {
		const payload = parsedJson as { delta?: unknown };
		const delta = typeof payload.delta === "string" ? payload.delta : "";
		return {
			type: "text_delta",
			contentIndex: 0,
			delta,
			partial: {
				status: "in_progress",
				content: [],
				toolCalls: [],
				approvals: [],
				warnings: [],
			},
		};
	}

	if (frame.event === "final") {
		const response = parsedJson as UnifiedResponse;
		return {
			type: "done",
			reason: unifiedStreamDoneReason(response.finishReason ?? "stop"),
			response,
		};
	}

	if (frame.event === "error") {
		const payload = parsedJson as {
			type?: unknown;
			reason?: unknown;
			message?: unknown;
			error?: unknown;
		};
		const reason: "error" | "aborted" =
			payload.reason === "aborted" || payload.reason === "abort"
				? "aborted"
				: "error";
		if (
			payload.type === "error" &&
			payload.error &&
			typeof payload.error === "object"
		) {
			return {
				type: "error",
				reason,
				error: payload.error as UnifiedResponse,
			};
		}
		const legacyMessage =
			typeof payload.message === "string"
				? payload.message
				: "Unified stream failed";
		return {
			type: "error",
			reason,
			error: unifiedResponseForStreamError(legacyMessage),
		};
	}

	const payload = parsedJson as UnifiedStreamEventType;
	if (payload && typeof payload === "object" && "type" in payload) {
		return payload;
	}

	return undefined;
}

function applyUnifiedStreamEvent(
	event: UnifiedStreamEventType,
	controller: UnifiedResponseStreamController,
): void {
	switch (event.type) {
		case "text_delta": {
			controller.pushText(event.delta);
			return;
		}
		case "done": {
			controller.complete(event.response);
			return;
		}
		case "error": {
			controller.error(
				new Error(event.error.errorMessage ?? "Unified stream failed"),
			);
			return;
		}
		default:
			return;
	}
}

async function assertReadableResponse(response: Response): Promise<void> {
	if (!response.ok) {
		const body = await response
			.clone()
			.text()
			.catch(() => "");
		throw new Error(
			body.length > 0
				? `Streaming request failed with status ${response.status}: ${body}`
				: `Streaming request failed with status ${response.status}`,
		);
	}

	if (response.body === null) {
		throw new Error("Streaming response body is missing");
	}
}
