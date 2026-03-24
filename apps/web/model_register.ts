export type ProviderName = "groq" | "cerebras" | "openai" ;
export type ModelRoute = {
	provider: ProviderName;
	upstreamModel: string;
};

export const modelRegister: Record<string, ModelRoute> = {
	// "gpt-oss-120": {
	//   provider: "groq",
	//   upstreamModel: "openai/gpt-oss-120b",
	// },
	// "gtp-oss-20b": {
	//   provider: "groq",
	//   upstreamModel: "openai/gpt-oss-20b",
	// },
	"llama-3.3-70b-versatile": {
		provider: "groq",
		upstreamModel: "llama-3.3-70b-versatile",
	},
	compound: {
		provider: "groq",
		upstreamModel: "groq/compound",
	},
	"compound-mini": {
		provider: "groq",
		upstreamModel: "groq/compound-mini",
	},
	"kimi-k2-instruct-0905": {
		provider: "groq",
		upstreamModel: "moonshotai/kimi-k2-instruct-0905",
	},
	"qwen3-32b": {
		provider: "groq",
		upstreamModel: "qwen/qwen3-32b",
	},
	"llama-4-scout-17b": {
		provider: "groq",
		upstreamModel: "meta-llama/llama-4-scout-17b-16e-instruct",
	},
	"meta-llama/llama-4-maverick-17b": {
		provider: "groq",
		upstreamModel: "meta-llama/llama-4-maverick-17b-128e-instruct",
	},
	// Cerebras
	"gpt-oss-120b": {
		provider: "cerebras",
		upstreamModel: "gpt-oss-120b",
  },
  "gpt-5.4": {
    provider: "openai",
    upstreamModel: "gpt-5.4",
  },
	"gpt-5.3-codex-spark": {
		provider: "openai",
		upstreamModel: "gpt-5.3-codex-spark",
  },
	"gpt-5.2": {
		provider: "openai",
		upstreamModel: "gpt-5.2",
  },
	"gpt-5.2-codex": {
		provider: "openai",
		upstreamModel: "gpt-5.2-codex",
	},
};
