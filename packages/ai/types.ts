import { Schema } from "effect";

export const Provider = Schema.Literal(
	"openai-codex",
	"anthropic-claude-code",
	"anthropic",
	"github-copilot",
	"google-gemini-cli",
);

/**
 * This tells us which transport the client uses for the run.
 */
export const Transport = Schema.Literal("sse", "websocket");

const StopReason = Schema.Literal(
	"stop",
	"max_tokens",
	"toolUse",
	"error",
	"aborted",
);

const cost = Schema.Struct({
	input: Schema.Number,
	output: Schema.Number,
	cacheRead: Schema.Number,
	cacheWrite: Schema.Number,
});

/**
 * This tells us what kind of attachment we are sending in the message.
 */
export const AttachmentKind = Schema.Literal(
	"image",
	"audio",
	"video",
	"document",
);

/**
 * This is the source of the attachment that we are sending in the message.
 */
export const AttachmentSource = Schema.Union(
	Schema.Struct({
		type: Schema.Literal("base64"),
		data: Schema.String,
	}),
	Schema.Struct({
		type: Schema.Literal("url"),
		url: Schema.String,
	}),
	Schema.Struct({
		type: Schema.Literal("file_id"),
		fileId: Schema.String,
	}),
);

/**
 * This is the attachment content that we are sending in the message.
 */
export const AttachmentContent = Schema.Struct({
	type: Schema.Literal("attachment"),
	kind: AttachmentKind,
	mimetype: Schema.String,
	filename: Schema.optional(Schema.String),
	source: AttachmentSource,
});

const InputType = Schema.Literal("text", "attachment");

/**
 * This is the shape that things need to be in while defining the models for the providers in sdk
 */
export const BaseModel = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	provider: Provider,
	reasoning: Schema.Boolean,
	baseUrl: Schema.URL,
	input: Schema.Array(InputType),
	cost: cost,
	contextWindow: Schema.Number,
	maxTokens: Schema.Number,
});

/**
 * This is a text content block that can be used in messages.
 */
export const TextContent = Schema.Struct({
	type: Schema.Literal("text"),
	text: Schema.String,
	textSignature: Schema.optional(Schema.String),
});

/**
 * This is a reasoning content block that can be used in assistant messages.
 */
export const ThinkingContent = Schema.Struct({
	type: Schema.Literal("thinking"),
	thinking: Schema.String,
	thinkingSignature: Schema.optional(Schema.String),
	redacted: Schema.optional(Schema.String),
});

/**
 * This is the tool call shape that assistant messages keep in history.
 * For OpenAI Responses, `id` is the output item id (`fc_…`) you must send back as `function_call.id`,
 * and `callId` is the correlation id (`call_…`) that pairs with `function_call_output.call_id`.
 */
export const Toolcall = Schema.Struct({
	type: Schema.Literal("toolcall"),
	id: Schema.String,
	callId: Schema.optional(Schema.String),
	name: Schema.String,
	arguments: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
	thoughtSignature: Schema.optional(Schema.String),
});

/**
 * This is the token and cost usage that we expose across providers.
 */
export const Usage = Schema.Struct({
	input: Schema.Number,
	output: Schema.Number,
	cacheRead: Schema.Number,
	cacheWrite: Schema.Number,
	totalTokens: Schema.Number,
	cost: Schema.Struct({
		input: Schema.Number,
		output: Schema.Number,
		cacheRead: Schema.Number,
		cacheWrite: Schema.Number,
		total: Schema.Number,
	}),
});

export const content = Schema.Union(TextContent, AttachmentContent);

/**
 * This is a user message that we send to the model.
 * `timestamp` is optional for new requests; add it when you need stable ordering in stored history.
 */
export const UserMessage = Schema.Struct({
	role: Schema.Literal("user"),
	content: Schema.Union(Schema.Array(content), Schema.String),
	timestamp: Schema.optional(Schema.Number),
});

/**
 * This is an assistant message that callers can keep in history for agent loops.
 * `provider` is optional because some provider responses may omit provider metadata.
 * `timestamp` is optional when you only need the model payload shape; set it when persisting history.
 */
export const baseAssistantMessage = Schema.Struct({
	role: Schema.Literal("assistant"),
	content: Schema.Array(Schema.Union(TextContent, ThinkingContent, Toolcall)),
	usage: Usage,
	provider: Schema.optional(Provider),
	stopReason: StopReason,
	errorMessage: Schema.optional(Schema.String),
	timestamp: Schema.optional(Schema.Number),
});

/**
 * This is a tool message that callers can keep in history for agent loops.
 * `timestamp` is optional for the same reason as user and assistant messages.
 */
export const ToolResultMessage = Schema.Struct({
	role: Schema.Literal("tool"),
	toolCallId: Schema.String,
	toolName: Schema.String,
	content: Schema.Array(Schema.Union(TextContent, AttachmentContent)),
	isError: Schema.Boolean,
	timestamp: Schema.optional(Schema.Number),
});

/**
 * This is the message union that callers pass back for continued runs.
 */
export const message = Schema.Union(
	UserMessage,
	baseAssistantMessage,
	ToolResultMessage,
);

/**
 * This tells us why a model run finished.
 */
export const ResponseFinishReason = Schema.Literal(
	"stop",
	"length",
	"tool-call",
	"content-filter",
	"error",
	"abort",
);

/**
 * This tells us the current status of a run.
 */
export const RunStatus = Schema.Literal(
	"queued",
	"in_progress",
	"requires_action",
	"completed",
	"failed",
	"aborted",
);

/**
 * This tells us what should happen when approval is rejected.
 */
export const ApprovalRejectionMode = Schema.Literal(
	"return_tool_error",
	"abort_run",
);

/**
 * This tells us the approval status for one tool call.
 */
export const ApprovalStatus = Schema.Literal("pending", "approved", "rejected");

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isJsonValue = (value: unknown): boolean => {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return true;
	}

	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}

	if (isPlainRecord(value)) {
		return Object.values(value).every(isJsonValue);
	}

	return false;
};

const isJsonSchemaObject = (
	value: unknown,
): value is Record<
	string,
	string | number | boolean | null | unknown[] | object
> => isPlainRecord(value) && Object.values(value).every(isJsonValue);

const isZodSchema = (value: unknown): boolean =>
	isPlainRecord(value) &&
	"_zod" in value &&
	typeof value.safeParse === "function";

const isEffectSchema = (value: unknown): boolean => Schema.isSchema(value);

/**
 * This is the supported tool input schema shape that callers can pass to the SDK.
 * We allow plain JSON Schema objects, Zod schemas, Effect schemas, and JS or TS object shorthand.
 */
export const ToolInputSchema = Schema.Unknown.pipe(
	Schema.filter(
		(value): value is unknown =>
			isJsonSchemaObject(value) || isZodSchema(value) || isEffectSchema(value),
		{
			message: () =>
				"Tool input schema must be a JSON Schema object, a Zod schema, an Effect schema, or JS/TS object shorthand.",
		},
	),
);

/**
 * This is the request that the UI can use to ask the user for approval.
 */
export const ApprovalRequest = Schema.Struct({
	id: Schema.String,
	runId: Schema.String,
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	status: ApprovalStatus,
	rejectionMode: ApprovalRejectionMode,
	reason: Schema.optional(Schema.String),
	metadata: Schema.optional(
		Schema.Record({ key: Schema.String, value: Schema.Unknown }),
	),
});

/**
 * This is the public tool definition that callers register with the SDK.
 * The input schema must be a JSON Schema object, a Zod schema, an Effect schema, or JS or TS object shorthand.
 * The execute function runs the tool locally when the caller wants to handle tool calls.
 */
export const ToolDefinition = Schema.Struct({
	name: Schema.String,
	description: Schema.String,
	inputSchema: ToolInputSchema,
	outputSchema: Schema.optional(Schema.Unknown),
	execute: Schema.optional(Schema.Any),
	retrySafe: Schema.optional(Schema.Boolean),
	requiresApproval: Schema.optional(Schema.Boolean),
	rejectionMode: Schema.optional(ApprovalRejectionMode),
	metadata: Schema.optional(
		Schema.Record({ key: Schema.String, value: Schema.Unknown }),
	),
});

/**
 * This is one stdio MCP server entry for bridge-mediated tool execution (Codex dynamicTools).
 */
export const McpServerStdioConfig = Schema.Struct({
	command: Schema.String,
	args: Schema.optional(Schema.Array(Schema.String)),
	env: Schema.optional(
		Schema.Record({ key: Schema.String, value: Schema.String }),
	),
});

/**
 * When set on openai-codex requests, the bridge POSTs each `item/tool/call` to this URL (localhost only)
 * so the SDK can run `execute()` in the same process as `run()`.
 */
export const ToolExecutionCallbackConfig = Schema.Struct({
	callbackUrl: Schema.String,
	bearerToken: Schema.String,
});

/**
 * This is the shared request shape for callers that want to send full message history.
 */
export const requestShape = Schema.Struct({
	provider: Provider,
	system: Schema.String,
	stream: Schema.Boolean,
	messages: Schema.Array(message),
	tools: Schema.optional(Schema.Array(ToolDefinition)),
	temperature: Schema.Number,
	maxRetries: Schema.Number,
	signal: Schema.optional(Schema.instanceOf(AbortSignal)),
});

/**
 * This is the text part that callers usually render in the UI.
 */
export const ResponseTextPart = Schema.Struct({
	type: Schema.Literal("text"),
	text: Schema.String,
});

/**
 * This is the reasoning part that callers can render in advanced UIs.
 */
export const ResponseReasoningPart = Schema.Struct({
	type: Schema.Literal("reasoning"),
	text: Schema.String,
});

/**
 * This is the tool call part that callers can use for approval and traces.
 * `id` matches the provider output item id (OpenAI: `fc_…`); `callId` is the OpenAI `call_…` id for tool results.
 */
export const ResponseToolCallPart = Schema.Struct({
	type: Schema.Literal("tool-call"),
	id: Schema.String,
	callId: Schema.optional(Schema.String),
	name: Schema.String,
	arguments: Schema.Unknown,
	approval: Schema.optional(ApprovalRequest),
	providerMetadata: Schema.optional(Schema.Unknown),
});

/**
 * This is the ordered output part union that callers can use to build custom UIs.
 */
export const ResponseContentPart = Schema.Union(
	ResponseTextPart,
	ResponseReasoningPart,
	ResponseToolCallPart,
);

/**
 * This is the metadata that we expose from the provider in a safe shape.
 */
export const ProviderMetadata = Schema.Struct({
	provider: Provider,
	requestId: Schema.optional(Schema.String),
	responseId: Schema.optional(Schema.String),
	messageId: Schema.optional(Schema.String),
	model: Schema.optional(Schema.String),
	rawFinishReason: Schema.optional(Schema.String),
});

/**
 * This is the single response shape that callers can trust from the SDK.
 * It keeps the final text, visible content parts, tool calls, and request status.
 */
export const UnifiedResponse = Schema.Struct({
	status: RunStatus,
	text: Schema.optional(Schema.String),
	object: Schema.optional(Schema.Unknown),
	content: Schema.Array(ResponseContentPart),
	toolCalls: Schema.Array(ResponseToolCallPart),
	approvals: Schema.Array(ApprovalRequest),
	usage: Schema.optional(Usage),
	finishReason: Schema.optional(ResponseFinishReason),
	providerMetadata: Schema.optional(ProviderMetadata),
	warnings: Schema.Array(Schema.String),
	errorMessage: Schema.optional(Schema.String),
});

export type Provider = typeof Provider.Type;
export type Transport = typeof Transport.Type;
export type cost = typeof cost.Type;
export type AttachmentKind = typeof AttachmentKind.Type;
export type AttachmentSource = typeof AttachmentSource.Type;
export type InputType = typeof InputType.Type;
export type BaseModel = typeof BaseModel.Type;
export type requestShape = typeof requestShape.Type;
export type TextContent = typeof TextContent.Type;
export type AttachmentContent = typeof AttachmentContent.Type;
export type ThinkingContent = typeof ThinkingContent.Type;
export type Toolcall = typeof Toolcall.Type;
export type Usage = typeof Usage.Type;
export type content = typeof content.Type;
export type UserMessage = typeof UserMessage.Type;
export type baseAssistantMessage = typeof baseAssistantMessage.Type;
export type ToolResultMessage = typeof ToolResultMessage.Type;
export type message = typeof message.Type;
export type ResponseFinishReason = typeof ResponseFinishReason.Type;
export type RunStatus = typeof RunStatus.Type;
export type ApprovalRejectionMode = typeof ApprovalRejectionMode.Type;
export type ApprovalStatus = typeof ApprovalStatus.Type;
export type ApprovalRequest = typeof ApprovalRequest.Type;
export type ToolDefinition = typeof ToolDefinition.Type;
export type ResponseTextPart = typeof ResponseTextPart.Type;
export type ResponseReasoningPart = typeof ResponseReasoningPart.Type;
export type ResponseToolCallPart = typeof ResponseToolCallPart.Type;
export type ResponseContentPart = typeof ResponseContentPart.Type;
export type ProviderMetadata = typeof ProviderMetadata.Type;
export type UnifiedResponse = typeof UnifiedResponse.Type;

/**
 * This matches pi-mono `done` success reasons (`StopReason` subset); we map Codex `finishReason` into these three.
 */
export const UnifiedStreamDoneReason = Schema.Literal(
	"stop",
	"length",
	"toolUse",
);

export type UnifiedStreamDoneReasonType = typeof UnifiedStreamDoneReason.Type;

/**
 * This is one live frame in the unified machine SSE stream.
 * Shape follows pi-mono `AssistantMessageEvent`: same event names and fields, with `UnifiedResponse` instead of `AssistantMessage` and `ResponseToolCallPart` instead of `ToolCall` on `toolcall_end`. The terminal `done` frame uses `response` (not `message`) for the final `UnifiedResponse`.
 * We add `approval_required` when a tool is marked `requiresApproval` in the request.
 */
export const UnifiedStreamEventStart = Schema.Struct({
	type: Schema.Literal("start"),
	partial: UnifiedResponse,
});

export const UnifiedStreamEventTextStart = Schema.Struct({
	type: Schema.Literal("text_start"),
	contentIndex: Schema.Number,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventTextDelta = Schema.Struct({
	type: Schema.Literal("text_delta"),
	contentIndex: Schema.Number,
	delta: Schema.String,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventTextEnd = Schema.Struct({
	type: Schema.Literal("text_end"),
	contentIndex: Schema.Number,
	content: Schema.String,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventThinkingStart = Schema.Struct({
	type: Schema.Literal("thinking_start"),
	contentIndex: Schema.Number,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventThinkingDelta = Schema.Struct({
	type: Schema.Literal("thinking_delta"),
	contentIndex: Schema.Number,
	delta: Schema.String,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventThinkingEnd = Schema.Struct({
	type: Schema.Literal("thinking_end"),
	contentIndex: Schema.Number,
	content: Schema.String,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventToolcallStart = Schema.Struct({
	type: Schema.Literal("toolcall_start"),
	contentIndex: Schema.Number,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventToolcallDelta = Schema.Struct({
	type: Schema.Literal("toolcall_delta"),
	contentIndex: Schema.Number,
	delta: Schema.String,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventToolcallEnd = Schema.Struct({
	type: Schema.Literal("toolcall_end"),
	contentIndex: Schema.Number,
	toolCall: ResponseToolCallPart,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventApprovalRequired = Schema.Struct({
	type: Schema.Literal("approval_required"),
	approval: ApprovalRequest,
	partial: UnifiedResponse,
});

export const UnifiedStreamEventDone = Schema.Struct({
	type: Schema.Literal("done"),
	reason: UnifiedStreamDoneReason,
	/**
	 * This is the final {@link UnifiedResponse} for the run (same shape as `generate()` batch `response`).
	 */
	response: UnifiedResponse,
});

export const UnifiedStreamEventError = Schema.Struct({
	type: Schema.Literal("error"),
	reason: Schema.Literal("error", "aborted"),
	error: UnifiedResponse,
});

/**
 * This is the full union of stream frames the machine may send (SSE `event` name matches `type`).
 */
export const UnifiedStreamEvent = Schema.Union(
	UnifiedStreamEventStart,
	UnifiedStreamEventTextStart,
	UnifiedStreamEventTextDelta,
	UnifiedStreamEventTextEnd,
	UnifiedStreamEventThinkingStart,
	UnifiedStreamEventThinkingDelta,
	UnifiedStreamEventThinkingEnd,
	UnifiedStreamEventToolcallStart,
	UnifiedStreamEventToolcallDelta,
	UnifiedStreamEventToolcallEnd,
	UnifiedStreamEventApprovalRequired,
	UnifiedStreamEventDone,
	UnifiedStreamEventError,
);

/**
 * This is one decoded unified SSE frame. It is written as an explicit union of struct types so
 * `event.type` stays a visible string-literal union in the IDE (better `switch` completion than
 * relying only on `typeof UnifiedStreamEvent.Type` from Schema.Union).
 */
export type UnifiedStreamEventType =
	| typeof UnifiedStreamEventStart.Type
	| typeof UnifiedStreamEventTextStart.Type
	| typeof UnifiedStreamEventTextDelta.Type
	| typeof UnifiedStreamEventTextEnd.Type
	| typeof UnifiedStreamEventThinkingStart.Type
	| typeof UnifiedStreamEventThinkingDelta.Type
	| typeof UnifiedStreamEventThinkingEnd.Type
	| typeof UnifiedStreamEventToolcallStart.Type
	| typeof UnifiedStreamEventToolcallDelta.Type
	| typeof UnifiedStreamEventToolcallEnd.Type
	| typeof UnifiedStreamEventApprovalRequired.Type
	| typeof UnifiedStreamEventDone.Type
	| typeof UnifiedStreamEventError.Type;

/**
 * This is the request shape for `event.type` on {@link UnifiedStreamEventType}; use it when you want
 * autocomplete for `case` labels or for objects keyed by event kind.
 */
export type UnifiedStreamEventKind = UnifiedStreamEventType["type"];

/**
 * This lists every {@link UnifiedStreamEventKind} in stream order; `satisfies` fails the build if a
 * variant is missing or renamed while the schema still lists it (or vice versa).
 */
export const UNIFIED_STREAM_EVENT_TYPE_VALUES = [
	"start",
	"text_start",
	"text_delta",
	"text_end",
	"thinking_start",
	"thinking_delta",
	"thinking_end",
	"toolcall_start",
	"toolcall_delta",
	"toolcall_end",
	"approval_required",
	"done",
	"error",
] as const satisfies readonly UnifiedStreamEventKind[];

/**
 * This is the streaming handle before optional `events` is attached (internal stream pump).
 */
export type UnifiedResponseStreamCoreResult = {
	readonly stream: true;
	readonly textStream: ReadableStream<string>;
	final(): Promise<UnifiedResponse>;
};

/**
 * This is what `generate({ stream: true })` returns: text stream, typed event iterator, and `final()`.
 */
export type UnifiedResponseStreamingResult = UnifiedResponseStreamCoreResult & {
	/**
	 * This yields every unified stream frame as it arrives (pi-mono-style `for await` over events).
	 */
	readonly events: AsyncIterable<UnifiedStreamEventType>;
};

export type UnifiedResponseBatchResult = {
	readonly stream: false;
	readonly response: UnifiedResponse;
};

export type UnifiedGenerateResult =
	| UnifiedResponseBatchResult
	| UnifiedResponseStreamingResult;

export type UnifiedResponseStreamController = {
	pushText(delta: string): void;
	complete(response: UnifiedResponse): void;
	error(cause?: unknown): void;
};

export type CreateUnifiedResponseStreamResult = {
	result: UnifiedResponseStreamCoreResult;
	controller: UnifiedResponseStreamController;
};

export type CreateClientOptions = {
	baseUrl?: string;
};

/**
 * This is the function shape that runs a tool with decoded input.
 */
export type ToolExecute = (input: unknown) => Promise<unknown> | unknown;

/**
 * This is the runtime tool shape that callers usually work with in apps.
 */
export type Tool = Omit<ToolDefinition, "execute"> & {
	execute?: ToolExecute;
};
