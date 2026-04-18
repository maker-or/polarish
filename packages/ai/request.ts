import { Schema } from "effect";
import { appRequestShape as anthropicClaudeCodeRequestShape } from "./providers/anthropic-claude-code/types.ts";
import { appRequestShape as openaiCodexRequestShape } from "./providers/openai-codex/types.ts";

/**
 * This is the full unified request shape across all providers that this package supports.
 * It keeps the shared message, tool, and streaming contract stable while each provider
 * narrows `provider` and `model` with its own schema.
 */
export const appRequestShape = Schema.Union(
	openaiCodexRequestShape,
	anthropicClaudeCodeRequestShape,
);

export type appRequestShape = typeof appRequestShape.Type;
