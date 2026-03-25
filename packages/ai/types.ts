import { Schema , Stream } from "effect";
import { stream } from "effect/FastCheck";


export const Provider = Schema.Literal(
  "openai-codex",
  "anthropic",
  "github-copilot",
  "google-gemini-cli",
);

const Transport = Schema.Literal("sse", "websocket", "auto");

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

const InputType = Schema.Literal("text", "image");
// add the provider specific fields like  reasoningEffort , ResponseStatus , reasoningSummary in the type.ts in that particaular folder
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

export const TextContent = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
  textSignature: Schema.optional(Schema.String),
});

export const ImageContent = Schema.Struct({
  type: Schema.Literal("image"),
  data: Schema.String, // base64 encoded image data
  mimetype: Schema.String,
});

export const ThinkingContent = Schema.Struct({
  type: Schema.Literal("thinking"),
  thinking: Schema.String,
  thinkingSignature: Schema.optional(Schema.String),
  redacted: Schema.optional(Schema.String),
});

export const Toolcall = Schema.Struct({
  type: Schema.Literal("toolcall"),
  id: Schema.String,
  name: Schema.String,
  arguments: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  thoughtSignature: Schema.optional(Schema.String),
});

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

export const content = Schema.Union(TextContent, ImageContent);

export const UserMessage = Schema.Struct({
  role: Schema.Literal("user"),
  content: Schema.Union(Schema.Array(content), Schema.String),
  timestamp: Schema.Number,
});

export const baseAssistantMessage = Schema.Struct({
  role: Schema.Literal("assistant"),
  content: Schema.Array(Schema.Union(TextContent, ThinkingContent, Toolcall)),
  usage: Usage,
  provider: Provider,
  stopReason: StopReason,
  errorMessage: Schema.optional(Schema.String),
  timestamp: Schema.Number,
});

export const ToolResultMessage = Schema.Struct({
  role: Schema.Literal("tool"),
  toolCallId: Schema.String,
  toolName: Schema.String,
  content: Schema.Array(Schema.Union(TextContent, ImageContent)),
  isError: Schema.Boolean,
  timestamp: Schema.Number,
});

export const message = Schema.Union(
  UserMessage,
  baseAssistantMessage,
  ToolResultMessage,
);

export const requestShape = Schema.Struct({
  provider: Provider,
  system: Schema.String,
  stream: Schema.Boolean,
  messages: Schema.Array(message),
  temperature: Schema.Number,
  maxRetries: Schema.Number,
  signal: Schema.optional(Schema.instanceOf(AbortSignal)),
});

// --- Unified response layer (see plan.md) ------------------------------------
// Distinct from chat `StopReason` on messages — map at boundaries when projecting.

/** Reason why a language model finished generating a response.
Can be one of the following:
- `stop`: the model generated a complete response
- `length`: the model generated maximum number of tokens
- `tool-call`: the model triggered tool calls
- `content-filter`: content filter violation stopped the model
- `error`: the model stopped because of an error
- `abort`: the model was aborted by the user
*/
export const ResponseFinishReason = Schema.Literal(
  "stop",
  "length",
  "tool-call",
  "content-filter",
  "error",
  "abort",
);

/** Normalized tool invocation for agents, UIs, and logs (response path). */
export const NormalizedToolCall = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  arguments: Schema.Unknown,
});

/** Normalized executed tool result (separate from assistant text and content). */
export const NormalizedToolResult = Schema.Struct({
  toolCallId: Schema.String,
  /** Outcome payload; shape depends on tool. */
  result: Schema.Unknown,
  isError: Schema.optional(Schema.Boolean),
});

/**
 * Canonical ordered content parts for the unified response (`content` field).
 * Part families: text, reasoning, tool-call, tool-result.
 */
export const ResponseTextPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});

export const ResponseReasoningPart = Schema.Struct({
  type: Schema.Literal("reasoning"),
  text: Schema.String,
});

export const ResponseToolCallPart = Schema.Struct({
  type: Schema.Literal("tool-call"),
  /** Aligns with `NormalizedToolCall.id` when both exist. */
  id: Schema.String,
  name: Schema.String,
  arguments: Schema.Unknown,
});

export const ResponseToolResultPart = Schema.Struct({
  type: Schema.Literal("tool-result"),
  toolCallId: Schema.String,
  result: Schema.Unknown,
  isError: Schema.optional(Schema.Boolean),
});

export const ResponseContentPart = Schema.Union(
  ResponseTextPart,
  ResponseReasoningPart,
  ResponseToolCallPart,
  ResponseToolResultPart,
);

/**
 * Curated metadata exposed to callers (which provider, ids, model — safe, stable fields).
 */
export const ProviderMetadata = Schema.Struct({
  provider: Provider,
  responseId: Schema.optional(Schema.String),
  messageId: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
});

/**
 * Final snapshot from `final()` and non-streaming success paths.
 * For a given run, prefer `text` or `object` per mode; both may be absent on failure paths.
 */
export const UnifiedResponse = Schema.Struct({
  text: Schema.optional(Schema.String),
  object: Schema.optional(Schema.Unknown),
  content: Schema.Array(ResponseContentPart),
  toolCalls: Schema.Array(NormalizedToolCall),
  toolResults: Schema.Array(NormalizedToolResult),
  usage: Schema.optional(Usage),
  finishReason: Schema.optional(ResponseFinishReason),
  providerMetadata: Schema.optional(ProviderMetadata),
  warnings: Schema.Array(Schema.String),
});


export type UnifiedStreamingResult = {
  readonly stream: true;
  readonly textStream?: ReadableStream<string>;
  readonly objectStream?: ReadableStream<unknown>;
  final(): Promise<UnifiedResponse>;
};
export type UnifiedBatchResult = {
  readonly stream: false;
  readonly response: UnifiedResponse;
};
export type UnifiedGenerateResult =
  | UnifiedBatchResult
  | UnifiedStreamingResult;


export type Provider = typeof Provider.Type;
export type Transport = typeof Transport.Type;
export type cost = typeof cost.Type;
export type InputType = typeof InputType.Type;
export type BaseModel = typeof BaseModel.Type;
export type requestShape = typeof requestShape.Type;
export type TextContent = typeof TextContent.Type;
export type ImageContent = typeof ImageContent.Type;
export type ThinkingContent = typeof ThinkingContent.Type;
export type Toolcall = typeof Toolcall.Type;
export type Usage = typeof Usage.Type;
export type content = typeof content.Type;
export type UserMessage = typeof UserMessage.Type;
export type baseAssistantMessage = typeof baseAssistantMessage.Type;
export type ToolResultMessage = typeof ToolResultMessage.Type;
export type message = typeof message.Type;
export type ResponseFinishReason = typeof ResponseFinishReason.Type;
export type NormalizedToolCall = typeof NormalizedToolCall.Type;
export type NormalizedToolResult = typeof NormalizedToolResult.Type;
export type ResponseTextPart = typeof ResponseTextPart.Type;
export type ResponseReasoningPart = typeof ResponseReasoningPart.Type;
export type ResponseToolCallPart = typeof ResponseToolCallPart.Type;
export type ResponseToolResultPart = typeof ResponseToolResultPart.Type;
export type ResponseContentPart = typeof ResponseContentPart.Type;
export type ProviderMetadata = typeof ProviderMetadata.Type;
export type UnifiedResponse = typeof UnifiedResponse.Type;
