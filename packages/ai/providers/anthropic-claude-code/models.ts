import { Schema } from "effect";
import { AnthropicClaudeCodeModelsSchema } from "./types.ts";

const rawAnthropicClaudeCode = {
	"claude-opus-4-6": {
		id: "claude-opus-4-6",
		name: "Claude Opus 4.6",
		provider: "anthropic-claude-code",
		baseUrl: "https://claude.ai",
		reasoning: true,
		input: ["text", "attachment"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: 0,
		maxTokens: 0,
	},
	"claude-sonnet-4-6": {
		id: "claude-sonnet-4-6",
		name: "Claude Sonnet 4.6",
		provider: "anthropic-claude-code",
		baseUrl: "https://claude.ai",
		reasoning: true,
		input: ["text", "attachment"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: 0,
		maxTokens: 0,
	},
	"claude-haiku-4-5": {
		id: "claude-haiku-4-5",
		name: "Claude Haiku 4.5",
		provider: "anthropic-claude-code",
		baseUrl: "https://claude.ai",
		reasoning: true,
		input: ["text", "attachment"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: 0,
		maxTokens: 0,
	},
};

export const anthropicClaudeCode = Schema.decodeUnknownSync(
	AnthropicClaudeCodeModelsSchema,
)(rawAnthropicClaudeCode);
