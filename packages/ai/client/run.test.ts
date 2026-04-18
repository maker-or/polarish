import { afterEach, describe, expect, test } from "bun:test";
import type { AppRequestShapeType, UnifiedResponseType } from "../index.ts";
import { run } from "./run.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("run", () => {
	test("uses request provider when response metadata omits provider", async () => {
		const request: AppRequestShapeType = {
			provider: "anthropic-claude-code",
			model: "claude-sonnet-4-6",
			system: "Be concise.",
			stream: false,
			temperature: 0.2,
			maxRetries: 1,
			messages: [
				{
					role: "user",
					content: "Say hello.",
					timestamp: 1,
				},
			],
		};

		const response: UnifiedResponseType = {
			status: "completed",
			text: "Hello",
			content: [{ type: "text", text: "Hello" }],
			toolCalls: [],
			approvals: [],
			finishReason: "stop",
			warnings: [],
		};

		globalThis.fetch = (async () =>
			Response.json(response)) as unknown as typeof globalThis.fetch;

		const result = await run(request, {
			endpoint: "https://example.com/v1/generate",
		});

		expect("response" in result).toBe(true);
		if (!("response" in result)) {
			throw new Error("expected batch run result");
		}
		expect(result.response).toEqual(response);
		expect(result.messages).toHaveLength(2);
		expect(result.messages[1]).toMatchObject({
			role: "assistant",
			provider: "anthropic-claude-code",
		});
	});
});
