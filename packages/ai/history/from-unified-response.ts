import type {
	ResponseContentPart,
	ResponseFinishReason,
	ResponseToolCallPart,
	ToolResultMessage,
	UnifiedResponse,
	Usage,
	baseAssistantMessage,
	message,
} from "../types.ts";

/** This is the mutable assistant content list we build before returning a `baseAssistantMessage`. */
type AssistantContentBlock = baseAssistantMessage["content"][number];

/**
 * This is the input shape for turning a local tool execution into a tool result message
 * that you can append to `messages` before the next `generate` call.
 */
export type ToolExecutionToMessageInput = {
	/** This should match the tool correlation id your provider expects (e.g. OpenAI `call_…`). */
	toolCallId: string;
	toolName: string;
	/** This is stringified when it is not already a string so it fits `TextContent` blocks. */
	result: unknown;
	isError?: boolean;
	timestamp?: number;
};

/**
 * This is the optional configuration for `toAssistantMessage`.
 */
export type UnifiedResponseToAssistantOptions = {
	timestamp?: number;
	/**
	 * This overrides usage when the response did not include token usage (common in some streams).
	 */
	usage?: Usage;
};

const zeroCost = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	total: 0,
} as const;

/**
 * This builds a zeroed usage object for assistant history when the model run did not report usage.
 */
export function emptyUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { ...zeroCost },
	};
}

/**
 * This maps `ResponseFinishReason` from a unified run to the `stopReason` field on assistant history.
 */
export function finishReasonToStopReason(
	finish: ResponseFinishReason | undefined,
): baseAssistantMessage["stopReason"] {
	switch (finish) {
		case "length":
			return "max_tokens";
		case "tool-call":
			return "toolUse";
		case "error":
			return "error";
		case "abort":
			return "aborted";
		case "content-filter":
			return "stop";
		case "stop":
			return "stop";
		default:
			return "stop";
	}
}

function resolveProvider(
	response: UnifiedResponse,
): baseAssistantMessage["provider"] {
	return response.providerMetadata?.provider;
}

/**
 * This normalizes tool arguments from a unified tool-call part into the record shape assistant history expects.
 */
export function normalizeToolArgumentsForHistory(
	argumentsValue: unknown,
): Record<string, unknown> {
	if (
		argumentsValue !== null &&
		typeof argumentsValue === "object" &&
		!Array.isArray(argumentsValue)
	) {
		return argumentsValue as Record<string, unknown>;
	}
	return {};
}

function responseToolCallToHistoryEntry(
	part: ResponseToolCallPart,
): AssistantContentBlock {
	return {
		type: "toolcall",
		id: part.id,
		...(part.callId !== undefined ? { callId: part.callId } : {}),
		name: part.name,
		arguments: normalizeToolArgumentsForHistory(part.arguments),
	};
}

function mapContentPart(part: ResponseContentPart): AssistantContentBlock {
	switch (part.type) {
		case "text":
			return { type: "text", text: part.text };
		case "reasoning":
			return { type: "thinking", thinking: part.text };
		case "tool-call":
			return responseToolCallToHistoryEntry(part);
		default: {
			const _exhaustive: never = part;
			return _exhaustive;
		}
	}
}

function appendOrphanToolCalls(
	content: AssistantContentBlock[],
	toolCalls: ReadonlyArray<ResponseToolCallPart>,
): void {
	const seen = new Set(
		content.filter((b) => b.type === "toolcall").map((b) => b.id),
	);
	for (const call of toolCalls) {
		if (!seen.has(call.id)) {
			content.push(responseToolCallToHistoryEntry(call));
			seen.add(call.id);
		}
	}
}

/**
 * This turns one completed `UnifiedResponse` into an assistant `message` you can push onto `messages`
 * before the next agent step. It walks `response.content` in order, maps text / reasoning / tool-call
 * parts to assistant content blocks, then appends any tool calls that only appear on `response.toolCalls`.
 *
 * When `response.text` is set but no text block came from `content`, this prepends a single text block
 * so you still recover the visible assistant text.
 */
export function toAssistantMessage(
	response: UnifiedResponse,
	options?: UnifiedResponseToAssistantOptions,
): baseAssistantMessage {
	const provider = resolveProvider(response);
	const usage = options?.usage ?? response.usage ?? emptyUsage();
	const content: AssistantContentBlock[] = [];

	for (const part of response.content) {
		content.push(mapContentPart(part));
	}

	const hasTextBlock = content.some((b) => b.type === "text");
	if (
		!hasTextBlock &&
		response.text !== undefined &&
		response.text.length > 0
	) {
		content.unshift({ type: "text", text: response.text });
	}

	appendOrphanToolCalls(content, response.toolCalls);

	return {
		role: "assistant",
		content,
		usage,
		...(provider !== undefined ? { provider } : {}),
		stopReason: finishReasonToStopReason(response.finishReason),
		timestamp: options?.timestamp ?? Date.now(),
		...(response.errorMessage !== undefined
			? { errorMessage: response.errorMessage }
			: {}),
	};
}

/**
 * This builds a `role: "tool"` message after you executed a tool locally, so you can append it to `messages`
 * and call `generate` again in a tool loop.
 */
export function toolExecutionToMessage(
	input: ToolExecutionToMessageInput,
): ToolResultMessage {
	const text =
		typeof input.result === "string"
			? input.result
			: JSON.stringify(input.result);

	return {
		role: "tool",
		toolCallId: input.toolCallId,
		toolName: input.toolName,
		content: [{ type: "text", text }],
		isError: input.isError ?? false,
		timestamp: input.timestamp ?? Date.now(),
	};
}

/**
 * This appends the assistant turn from a unified response and returns a new messages array.
 * It delegates to {@link toAssistantMessage}: maps `response.content` (text,
 * reasoning, tool-call parts), fills text from `response.text` when needed, merges orphan
 * `response.toolCalls`, and sets usage / stopReason / provider. Tool results are not included;
 * after you run tools, append with {@link toolExecutionToMessage} before the next `generate`.
 *
 * @param messages - Prior conversation turns for the next agent step.
 * @param response - Final `UnifiedResponse` from batch `generate` or `final()` / `done` when streaming.
 * @param options - Optional `usage` when run omitted usage, and optional `timestamp` for assistant message.
 */
export function appendAssistant(
	messages: ReadonlyArray<message>,
	response: UnifiedResponse,
	options?: UnifiedResponseToAssistantOptions,
): message[] {
	return [...messages, toAssistantMessage(response, options)];
}
