import { describe, expect, test } from "bun:test";
import type { AppRequestShapeType, UnifiedResponseType } from "../index.ts";
import { generate } from "./generate.ts";

const streamingRequest: AppRequestShapeType = {
	provider: "anthropic-claude-code",
	model: "claude-sonnet-4-6",
	system: "Be concise.",
	stream: true,
	temperature: 0.2,
	maxRetries: 2,
	messages: [
		{
			role: "user",
			content: "Say hello.",
			timestamp: 1,
		},
	],
};

async function readTextStream(
	stream: ReadableStream<string>,
): Promise<string[]> {
	const reader = stream.getReader();
	const chunks: string[] = [];

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	return chunks;
}

describe("generate", () => {
	test("returns a streaming result for stream=true responses", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (input, init) => {
			expect(input).toBe("https://example.com/v1/chat/completions");
			expect(init?.method).toBe("POST");
			expect(init?.headers).toBeInstanceOf(Headers);
			expect(
				JSON.parse(String(init?.body)) satisfies Record<string, unknown>,
			).not.toHaveProperty("signal");

			return new Response(
				[
					"event: text",
					'data: {"delta":"Hello"}',
					"",
					"event: final",
					'data: {"status":"completed","text":"Hello","content":[{"type":"text","text":"Hello"}],"toolCalls":[],"approvals":[],"finishReason":"stop","providerMetadata":{"provider":"anthropic-claude-code"},"warnings":[]}',
					"",
				].join("\n"),
				{
					status: 200,
					headers: {
						"content-type": "text/event-stream",
					},
				},
			);
		}) as typeof globalThis.fetch;

		try {
			const result = await generate(streamingRequest, {
				endpoint: "https://example.com/v1/chat/completions",
			});

			expect(result.stream).toBe(true);
			if (!result.stream) {
				throw new Error("expected streaming result");
			}
			const chunks = await readTextStream(result.textStream);
			const final = await result.final();

			expect(chunks).toEqual(["Hello"]);
			expect(final.text).toBe("Hello");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("returns a batch result for stream=false responses", async () => {
		const batchRequest: AppRequestShapeType = {
			...streamingRequest,
			stream: false,
		};

		const finalResponse: UnifiedResponseType = {
			status: "completed",
			text: "Collected response",
			content: [{ type: "text", text: "Collected response" }],
			toolCalls: [],
			approvals: [],
			finishReason: "stop",
			providerMetadata: {
				provider: "anthropic-claude-code",
				responseId: "resp_789",
			},
			warnings: [],
		};

		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (input, init) => {
			expect(input).toBe("https://example.com/v1/chat/completions");
			expect(init?.method).toBe("POST");

			return Response.json(finalResponse);
		}) as typeof globalThis.fetch;

		try {
			const result = await generate(batchRequest, {
				endpoint: "https://example.com/v1/chat/completions",
			});

			expect(result.stream).toBe(false);
			if (!result.stream) {
				expect(result.response).toEqual(finalResponse);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
