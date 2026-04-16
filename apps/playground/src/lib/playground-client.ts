import { create } from "@hax/ai";
import type { UnifiedResponseType, UnifiedStreamEventPayload } from "@hax/ai";

/**
 * This makes a timestamped trace message for debugging.
 */
function formatTrace(step: string, detail?: string): string {
	const now = new Date().toISOString();
	return detail ? `[${now}] ${step}: ${detail}` : `[${now}] ${step}`;
}

/**
 * This is the only input we expect from the UI.
 */
export type PlaygroundRunInput = {
	latestMessage: string;
};

/**
 * This is the rich callback set for wiring stream events to the UI.
 */
export type PlaygroundRequestHandlers = {
	onTrace?: (message: string) => void;
	onEvent?: (event: UnifiedStreamEventPayload) => void;
	onStart?: (
		event: Extract<UnifiedStreamEventPayload, { type: "start" }>,
	) => void;
	onTextStart?: (
		event: Extract<UnifiedStreamEventPayload, { type: "text_start" }>,
	) => void;
	onTextDelta?: (
		event: Extract<UnifiedStreamEventPayload, { type: "text_delta" }>,
	) => void;
	onTextEnd?: (
		event: Extract<UnifiedStreamEventPayload, { type: "text_end" }>,
	) => void;
	onThinkingStart?: (
		event: Extract<UnifiedStreamEventPayload, { type: "thinking_start" }>,
	) => void;
	onThinkingDelta?: (
		event: Extract<UnifiedStreamEventPayload, { type: "thinking_delta" }>,
	) => void;
	onThinkingEnd?: (
		event: Extract<UnifiedStreamEventPayload, { type: "thinking_end" }>,
	) => void;
	onToolCallStart?: (
		event: Extract<UnifiedStreamEventPayload, { type: "toolcall_start" }>,
	) => void;
	onToolCallDelta?: (
		event: Extract<UnifiedStreamEventPayload, { type: "toolcall_delta" }>,
	) => void;
	onToolCallEnd?: (
		event: Extract<UnifiedStreamEventPayload, { type: "toolcall_end" }>,
	) => void;
	onApprovalRequired?: (
		event: Extract<UnifiedStreamEventPayload, { type: "approval_required" }>,
	) => void;
	onDone?: (
		event: Extract<UnifiedStreamEventPayload, { type: "done" }>,
	) => void;
	onError?: (
		event: Extract<UnifiedStreamEventPayload, { type: "error" }>,
	) => void;
};

const hax = create({
	baseUrl: import.meta.env.VITE_MACHINE_BASE_URL ?? "http://127.0.0.1:4318",
});

/**
 * This builds the request here and forwards rich package stream events to UI callbacks.
 */
export async function runPlaygroundRequest(
	input: PlaygroundRunInput,
	handlers: PlaygroundRequestHandlers = {},
): Promise<UnifiedResponseType> {
	const emitTrace = (step: string, detail?: string) => {
		const message = formatTrace(step, detail);
		handlers.onTrace?.(message);
		console.debug(message);
	};

	emitTrace("run.start", "initializing playground request");
	emitTrace("request.built", `messages=${input.latestMessage}`);

	emitTrace("request.send", "calling hax.generate");
	const result = await hax.generate({
		provider: "openai-codex",
		model: "gpt-5.4",
		system: "You are a really helpful AI assistant.",
		stream: true,
		temperature: 0.7,
		maxRetries: 2,
		messages: [
			{
				role: "user",
				content: input.latestMessage,
				timestamp: Date.now(),
			},
		],
	});
	emitTrace("response.received", `stream=${String(result.stream)}`);

	if (!result.stream) {
		emitTrace("response.batch", "non-stream response path");
		const doneEvent = {
			type: "done",
			reason: "stop",
			response: result.response,
		} as Extract<UnifiedStreamEventPayload, { type: "done" }>;
		handlers.onDone?.(doneEvent);
		emitTrace("run.done", "batch response returned");
		return result.response;
	}

	emitTrace("response.stream.start", "consuming stream events");
	for await (const event of result.events) {
		emitTrace("response.stream.event", event.type);
		handlers.onEvent?.(event);

		switch (event.type) {
			case "start":
				{
					handlers.onStart?.(event);
					console.log(event.partial);
				}

				break;
			case "text_start":
				{
					handlers.onTextStart?.(event);
					console.log(event.partial);
				}
				break;
			case "text_delta":
				emitTrace("response.stream.text_delta", `chars=${event.delta.length}`);
				handlers.onTextDelta?.(event);
				console.log(event.delta);
				break;
			case "text_end":
				handlers.onTextEnd?.(event);
				console.log(event.content);
				break;
			case "thinking_start":
				handlers.onThinkingStart?.(event);
				console.log(event.partial);
				break;
			case "thinking_delta":
				handlers.onThinkingDelta?.(event);
				console.log(event.delta);
				break;
			case "thinking_end":
				handlers.onThinkingEnd?.(event);
				console.log(event.content);

				break;
			case "toolcall_start":
				handlers.onToolCallStart?.(event);
				break;
			case "toolcall_delta":
				handlers.onToolCallDelta?.(event);
				break;
			case "toolcall_end":
				handlers.onToolCallEnd?.(event);
				break;
			case "approval_required":
				handlers.onApprovalRequired?.(event);
				break;
			case "done":
				handlers.onDone?.(event);
				emitTrace("run.done", "stream done event received");
				return event.response;
			case "error":
				handlers.onError?.(event);
				emitTrace("run.error", "stream error event received");
				return event.error;
			default:
				break;
		}
	}

	emitTrace("response.stream.final", "awaiting final response snapshot");
	const final = await result.final();
	emitTrace("run.done", "returned result.final()");
	return final;
}
