import { Schema } from "effect";
import { BaseModel, ToolDefinition, message } from "../../types.ts";

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
	image_url: Schema.optional(Schema.String),
	file_id: Schema.optional(Schema.String),
});

/**
 * This is a file input that we send to Codex for non-image attachments.
 */
export const fileInput = Schema.Struct({
	type: Schema.Literal("input_file"),
	file_data: Schema.optional(Schema.String),
	file_url: Schema.optional(Schema.String),
	file_id: Schema.optional(Schema.String),
	filename: Schema.optional(Schema.String),
});

export const codexInputContent = Schema.Union(textInput, imageInput, fileInput);

/**
 *  Assistant turns in Codex Responses `input` must use `output_text` or `refusal`, not `input_*`.
 */
export const assistantContentPart = Schema.Struct({
	type: Schema.Literal("output_text"),
	text: Schema.String,
});

/**
 *  these usally represent input array that we send in the codex for different roles
 */
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

/**
 * This is the native function call item that we send back in follow-up input.
 */
export const functionCallInputType = Schema.Struct({
	type: Schema.Literal("function_call"),
	id: Schema.String,
	call_id: Schema.String,
	name: Schema.String,
	arguments: Schema.String,
});

/**
 * This is the tool output item that we send back after executing a function tool.
 */
export const functionToolOutputType = Schema.Struct({
	type: Schema.Literal("function_call_output"),
	call_id: Schema.String,
	output: Schema.String,
});

export const inputMessageType = Schema.Union(
	devloperMessagetype,
	userMessageType,
	assistantMessageType,
	functionCallInputType,
	functionToolOutputType,
);

/**
 * This is the function tool definition we send to the Codex Responses API.
 */
export const codexFunctionTool = Schema.Struct({
	type: Schema.Literal("function"),
	name: Schema.String,
	description: Schema.String,
	parameters: Schema.Unknown,
	strict: Schema.Boolean,
});

/**
 *  this are the model name that we need to use when sending requests to the codex APIs
 */
export const CodexModelId = Schema.Literal(
	"gpt-5.1",
	"gpt-5.1-codex-max",
	"gpt-5.1-codex-mini",
	"gpt-5.2",
	"gpt-5.2-codex",
	"gpt-5.3-codex",
	"gpt-5.3-codex-spark",
  "gpt-5.4",
  "gpt-5.4-mini",
	"gpt-5.4-nano"
);

/**
 * This is the union of `model` string ids for `provider: "openai-codex"` requests (same set as `CodexModelId` schema).
 */
export type CodexModelIdType = typeof CodexModelId.Type;

/**
 *  this is the shape of the body that we send to the codex APIs
 */
export const codexRequestShape = Schema.Struct({
	model: CodexModelId,
	instructions: Schema.String,
	input: Schema.Array(inputMessageType),
	tools: Schema.optional(Schema.Array(codexFunctionTool)),
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

/**
 *  this is the codex specific type from the unified request api
 */
export const appRequestShape = Schema.Struct({
	provider: Schema.Literal("openai-codex"),
	system: Schema.String,
	stream: Schema.Boolean,
	messages: Schema.Array(message),
	tools: Schema.optional(Schema.Array(ToolDefinition)),
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
export type functionCallInputType = typeof functionCallInputType.Type;
export type functionToolOutputType = typeof functionToolOutputType.Type;
export type codexFunctionTool = typeof codexFunctionTool.Type;
export type codexRequestShape = typeof codexRequestShape.Type;
export type textInput = typeof textInput.Type;
export type imageInput = typeof imageInput.Type;
export type fileInput = typeof fileInput.Type;
export type streamShape = typeof streamShape.Type;
