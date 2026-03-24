export const providers = {
	groq: {
		base_url: "https://api.groq.com/openai/v1",
		api_key: process.env.GROQ_API_KEY || "",
	},
	cerebras: {
		base_url: "https://api.cerebras.ai/v1",
		api_key: process.env.CEREBRAS_API_KEY || "",
  },
  openai: {
    base_url: "https://chatgpt.com/backend-api/codex/responses",
    api_key: process.env.OPENAI_API_KEY || "",
  },
};
