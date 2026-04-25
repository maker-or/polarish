import { Schema } from "effect";
import { CodexModelsSchema } from "./types.ts";

const rawOpenaiCodex = {
	"gpt-5.2": {
		id: "gpt-5.2",
		name: "GPT-5.2",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text", "attachment"],
		cost: {
			input: 1.75,
			output: 14,
			cacheRead: 0.175,
			cacheWrite: 0,
		},
		contextWindow: 272000,
		maxTokens: 128000,
	},
	"gpt-5.3-codex": {
		id: "gpt-5.3-codex",
		name: "GPT-5.3 Codex",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text", "attachment"],
		cost: {
			input: 1.75,
			output: 14,
			cacheRead: 0.175,
			cacheWrite: 0,
		},
		contextWindow: 272000,
		maxTokens: 128000,
	},
	"gpt-5.3-codex-spark": {
		id: "gpt-5.3-codex-spark",
		name: "GPT-5.3 Codex Spark",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: 128000,
		maxTokens: 128000,
	},
	"gpt-5.4": {
		id: "gpt-5.4",
		name: "GPT-5.4",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text", "attachment"],
		cost: {
			input: 2.5,
			output: 15,
			cacheRead: 0.25,
			cacheWrite: 0,
		},
		contextWindow: 272000,
		maxTokens: 128000,
	},
	"gpt-5.4-mini": {
		id: "gpt-5.4-mini",
		name: "GPT-5.4 Mini",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text", "attachment"],
		cost: {
			input: 0.4,
			output: 3.2,
			cacheRead: 0.04,
			cacheWrite: 0,
		},
		contextWindow: 272000,
		maxTokens: 128000,
	},
	"gpt-5.5": {
		id: "gpt-5.5",
		name: "GPT-5.5",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text", "attachment"],
		cost: {
			input: 5,
			output: 30,
			cacheRead: 0.5,
			cacheWrite: 0,
		},
		contextWindow: 272000,
		maxTokens: 128000,
	},
};

export const openaiCodex =
	Schema.decodeUnknownSync(CodexModelsSchema)(rawOpenaiCodex);
