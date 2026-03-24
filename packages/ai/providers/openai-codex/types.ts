import { Schema } from "effect";
import { BaseModel, message } from "../../types";

export const CodexResponseStatus = Schema.Literal(
  "completed",
  "incomplete",
  "failed",
  "cancelled",
  "queued",
  "in_progress",
);
export const CodexReasoningEffort = Schema.Literal(
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
);

export const textInput = Schema.Struct({
  type: Schema.Literal("input_text"),
  text: Schema.String,
});

export const imageInput = Schema.Struct({
  type: Schema.Literal("input_image"),
  image_url: Schema.String,
});

export const codexInputContent = Schema.Union(textInput, imageInput);

/** Assistant turns in Codex Responses `input` must use `output_text` or `refusal`, not `input_*`. */
export const assistantContentPart = Schema.Struct({
  type: Schema.Literal("output_text"),
  text: Schema.String,
});

// these usally represent input array that we send in the codex for different roles
const devloperMessagetype = Schema.Struct({
  role: Schema.Literal("developer"),
  content: Schema.String,
});

const userMessageType = Schema.Struct({
  role: Schema.Literal("user"),
  content: Schema.Union(Schema.String, Schema.Array(codexInputContent)),
});

const assistantMessageType = Schema.Struct({
  role: Schema.Literal("assistant"),
  content: Schema.Union(Schema.String, Schema.Array(assistantContentPart)),
});

export const inputMessageType = Schema.Union(
  devloperMessagetype,
  userMessageType,
  assistantMessageType,
);
export const CodexModelId = Schema.Literal(
  "gpt-5.1",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.4",
);

// this is the shape of the body that we send to the codex APIs
export const codexRequestShape = Schema.Struct({
  model: CodexModelId,
  instructions: Schema.String,
  input: Schema.Array(inputMessageType),
  stream: Schema.Boolean,
  store: Schema.Boolean,
});

export const CodexReasoningSummary = Schema.Literal(
  "auto",
  "concise",
  "detailed",
  "off",
  "on",
);

// this is the codex specific type from the unified request api
export const appRequestShape = Schema.Struct({
  provider: Schema.Literal("openai-codex"),
  system: Schema.String,
  stream: Schema.Boolean,
  messages: Schema.Array(message),
  temperature: Schema.Number,
  maxRetries: Schema.Number,
  signal: Schema.optional(Schema.instanceOf(AbortSignal)),
  model: CodexModelId,
});

export const CodexModelsSchema = Schema.Record({
  key: CodexModelId,
  value: BaseModel,
});
/**
 * This is the shape that we expected chunck that come from your infernce provider to be
 */
const streamShape = Schema.Struct({
  event: Schema.String,
  data: Schema.Record({
    key: Schema.String,
    value: Schema.Unknown,
  }),
});
export type CodexResponseStatus = typeof CodexResponseStatus.Type;
export type ReasoningEffort = typeof CodexReasoningEffort.Type;
export type ReasoningSummary = typeof CodexReasoningSummary.Type;
export type CodexModelsSchema = typeof CodexModelsSchema.Type;
export type appRequestShape = typeof appRequestShape.Type;
export type codexInputContent = typeof codexInputContent.Type;
export type assistantContentPart = typeof assistantContentPart.Type;
export type inputMessageType = typeof inputMessageType.Type;
export type codexRequestShape = typeof codexRequestShape.Type;
export type textInput = typeof textInput.Type;
export type imageInput = typeof imageInput.Type;
export type streamShape = typeof streamShape.Type;
