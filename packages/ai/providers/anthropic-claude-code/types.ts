import { Schema } from "effect";
import {
	BaseModel,
	McpServerStdioConfig,
	ToolDefinition,
	ToolExecutionCallbackConfig,
	message,
} from "../../types.ts";

/**
 * This is the Claude Code model id union that callers can use for
 * `provider: "anthropic-claude-code"` requests.
 */
export const AnthropicClaudeCodeModelId = Schema.Literal(
	"claude-opus-4-6",
	"claude-sonnet-4-6",
	"claude-haiku-4-5",
);

/**
 * This is the Claude Code specific type from the unified request API.
 */
export const appRequestShape = Schema.Struct({
	provider: Schema.Literal("anthropic-claude-code"),
	system: Schema.String,
	stream: Schema.Boolean,
	messages: Schema.Array(message),
	tools: Schema.optional(Schema.Array(ToolDefinition)),
	mcpServers: Schema.optional(
		Schema.Record({ key: Schema.String, value: McpServerStdioConfig }),
	),
	toolExecution: Schema.optional(ToolExecutionCallbackConfig),
	temperature: Schema.Number,
	maxRetries: Schema.Number,
	signal: Schema.optional(Schema.instanceOf(AbortSignal)),
	model: AnthropicClaudeCodeModelId,
});

export const AnthropicClaudeCodeModelsSchema = Schema.Record({
	key: AnthropicClaudeCodeModelId,
	value: BaseModel,
});

export type AnthropicClaudeCodeModelIdType =
	typeof AnthropicClaudeCodeModelId.Type;
export type AnthropicClaudeCodeModelsSchema =
	typeof AnthropicClaudeCodeModelsSchema.Type;
export type appRequestShape = typeof appRequestShape.Type;
