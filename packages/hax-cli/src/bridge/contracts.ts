/**
 * This is one attachment source that points at a URL.
 */
type UrlAttachmentSource = {
	type: "url";
	url: string;
};

/**
 * This is one attachment source that carries base64 data.
 */
type Base64AttachmentSource = {
	type: "base64";
	data: string;
};

/**
 * This is one attachment source that points at a provider file id.
 */
type FileIdAttachmentSource = {
	type: "file_id";
	fileId: string;
};

/**
 * This is one user or tool attachment entry.
 */
type AttachmentContent = {
	type: "attachment";
	kind: "image" | "audio" | "video" | "document";
	mimetype: string;
	source: UrlAttachmentSource | Base64AttachmentSource | FileIdAttachmentSource;
	filename?: string;
};

/**
 * This is one text content entry for user and tool messages.
 */
type TextContent = {
	type: "text";
	text: string;
};

/**
 * This is one assistant reasoning entry.
 */
type ThinkingContent = {
	type: "thinking";
	thinking: string;
};

/**
 * This is one assistant tool call entry.
 */
type AssistantToolCallContent = {
	type: "toolcall";
	id: string;
	name: string;
	arguments: unknown;
	callId?: string;
};

/**
 * This is one user message in the unified request.
 */
type UserMessage = {
	role: "user";
	content: string | Array<TextContent | AttachmentContent>;
	timestamp?: number;
};

/**
 * This is one assistant message in the unified request.
 */
type AssistantMessage = {
	role: "assistant";
	content: Array<TextContent | ThinkingContent | AssistantToolCallContent>;
	timestamp?: number;
};

/**
 * This is one tool result message in the unified request.
 */
type ToolMessage = {
	role: "tool";
	toolName: string;
	toolCallId: string;
	content: Array<TextContent | AttachmentContent>;
	isError?: boolean;
	timestamp?: number;
};

/**
 * This is one runtime tool definition in the unified request.
 */
type ToolDefinition = {
	name: string;
	description?: string;
	inputSchema: unknown;
	requiresApproval?: boolean;
	retrySafe?: boolean;
	rejectionMode?: "return_tool_error" | "abort_run";
};

export type McpServerStdioConfigType = {
	command: string;
	args?: string[];
	env?: Record<string, string>;
};

export type ToolExecutionCallbackConfigType = {
	callbackUrl: string;
	bearerToken: string;
};

/**
 * This is the request shape that the bridge accepts from browser apps.
 */
export type AppRequestShapeType = {
	provider: "openai-codex" | "anthropic-claude-code";
	model: string;
	system: string;
	stream: boolean;
	temperature: number;
	maxRetries: number;
	messages: Array<UserMessage | AssistantMessage | ToolMessage>;
	tools?: ToolDefinition[];
	/**
	 * openai-codex only: MCP servers whose tools are registered as Codex experimental `dynamicTools`
	 * and executed via `item/tool/call` → MCP `tools/call`.
	 */
	mcpServers?: Record<string, McpServerStdioConfigType>;
	/**
	 * openai-codex only: when set, non-`mcp__*` `item/tool/call` targets are POSTed here so the SDK can run `execute()` locally.
	 */
	toolExecution?: ToolExecutionCallbackConfigType;
};

/**
 * This is one response text part in the unified response.
 */
type ResponseTextPart = {
	type: "text";
	text: string;
};

/**
 * This is one response reasoning part in the unified response.
 */
type ResponseReasoningPart = {
	type: "reasoning";
	text: string;
};

/**
 * This is one response tool call part in the unified response.
 */
type ResponseToolCallPart = {
	type: "tool-call";
	id: string;
	name: string;
	arguments: unknown;
	callId?: string;
};

/**
 * This is one approval item in the unified response.
 */
type ApprovalRequest = {
	id: string;
	runId: string;
	toolCallId: string;
	toolName: string;
	input: unknown;
	status: "pending" | "approved" | "rejected";
	rejectionMode: "return_tool_error" | "abort_run";
};

/**
 * This is the finish reason enum used by the unified response.
 */
export type ResponseFinishReasonType =
	| "stop"
	| "length"
	| "tool-call"
	| "error"
	| "abort";

/**
 * This is one response content part in the unified response.
 */
export type ResponseContentPartType =
	| ResponseTextPart
	| ResponseReasoningPart
	| ResponseToolCallPart;

/**
 * This is the final response shape returned by the bridge.
 */
export type UnifiedResponseType = {
	status: "in_progress" | "completed" | "failed" | "aborted";
	text?: string;
	content: ResponseContentPartType[];
	toolCalls: ResponseToolCallPart[];
	approvals: ApprovalRequest[];
	finishReason?: ResponseFinishReasonType;
	providerMetadata?: {
		provider: AppRequestShapeType["provider"];
		requestId?: string;
		model?: string;
	};
	warnings: string[];
	errorMessage?: string;
};

/**
 * This is the full stream event union returned by the bridge.
 */
export type UnifiedStreamEventPayload =
	| {
			type: "start";
			partial: UnifiedResponseType;
	  }
	| {
			type: "text_start";
			contentIndex: number;
			partial: UnifiedResponseType;
	  }
	| {
			type: "text_delta";
			contentIndex: number;
			delta: string;
			partial: UnifiedResponseType;
	  }
	| {
			type: "text_end";
			contentIndex: number;
			content: string;
			partial: UnifiedResponseType;
	  }
	| {
			type: "thinking_start";
			contentIndex: number;
			partial: UnifiedResponseType;
	  }
	| {
			type: "thinking_delta";
			contentIndex: number;
			delta: string;
			partial: UnifiedResponseType;
	  }
	| {
			type: "thinking_end";
			contentIndex: number;
			content: string;
			partial: UnifiedResponseType;
	  }
	| {
			type: "toolcall_start";
			contentIndex: number;
			partial: UnifiedResponseType;
	  }
	| {
			type: "toolcall_delta";
			contentIndex: number;
			delta: string;
			partial: UnifiedResponseType;
	  }
	| {
			type: "toolcall_end";
			contentIndex: number;
			toolCall: ResponseToolCallPart;
			partial: UnifiedResponseType;
	  }
	| {
			type: "approval_required";
			approval: ApprovalRequest;
			partial: UnifiedResponseType;
	  }
	| {
			type: "done";
			reason: "stop" | "length" | "toolUse";
			response: UnifiedResponseType;
	  }
	| {
			type: "error";
			reason: "error" | "aborted";
			error: UnifiedResponseType;
	  };

/**
 * This is the streaming result shape returned when `stream` is true.
 */
export type UnifiedResponseStreamingResultType = {
	stream: true;
	textStream: ReadableStream<string>;
	events: AsyncIterable<UnifiedStreamEventPayload>;
	final(): Promise<UnifiedResponseType>;
};

/**
 * This is the batch or streaming generate result shape.
 */
export type UnifiedGenerateResultType =
	| {
			stream: false;
			response: UnifiedResponseType;
	  }
	| UnifiedResponseStreamingResultType;

/**
 * This is the internal controller used to settle a streaming result.
 */
type UnifiedResponseStreamController = {
	pushText(delta: string): void;
	complete(response: UnifiedResponseType): void;
	error(cause?: unknown): void;
};

/**
 * This creates the text stream and final promise used by streaming runs.
 */
export function createUnifiedResponseStream(): {
	controller: UnifiedResponseStreamController;
	result: Omit<UnifiedResponseStreamingResultType, "events">;
} {
	let textController: ReadableStreamDefaultController<string> | undefined;
	let settled = false;

	let resolveFinal!: (response: UnifiedResponseType) => void;
	let rejectFinal!: (cause?: unknown) => void;

	const finalPromise = new Promise<UnifiedResponseType>((resolve, reject) => {
		resolveFinal = resolve;
		rejectFinal = reject;
	});

	const textStream = new ReadableStream<string>({
		start(controller) {
			textController = controller;
		},
	});

	return {
		controller: {
			pushText(delta) {
				if (!settled && delta.length > 0 && textController) {
					textController.enqueue(delta);
				}
			},
			complete(response) {
				if (settled) {
					return;
				}
				settled = true;
				textController?.close();
				resolveFinal(response);
			},
			error(cause) {
				if (settled) {
					return;
				}
				settled = true;
				textController?.error(cause);
				rejectFinal(cause);
			},
		},
		result: {
			stream: true,
			textStream,
			final() {
				return finalPromise;
			},
		},
	};
}

/**
 * This builds a minimal error-shaped unified response.
 */
export function unifiedResponseForStreamError(
	errorMessage: string,
): UnifiedResponseType {
	return {
		status: "failed",
		content: [],
		toolCalls: [],
		approvals: [],
		finishReason: "error",
		warnings: [],
		errorMessage,
	};
}
