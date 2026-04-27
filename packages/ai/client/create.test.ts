import { afterEach, describe, expect, test } from "bun:test";
import type { AppRequestShapeType, UnifiedResponseType } from "../index.ts";
import { create } from "./create.ts";

const originalFetch = globalThis.fetch;

const request: AppRequestShapeType = {
	provider: "anthropic-claude-code",
	model: "claude-sonnet-4-6",
	system: "Be concise.",
	stream: false,
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

const finalResponse: UnifiedResponseType = {
	status: "completed",
	text: "Hello",
	content: [{ type: "text", text: "Hello" }],
	toolCalls: [],
	approvals: [],
	finishReason: "stop",
	providerMetadata: {
		provider: "anthropic-claude-code",
	},
	warnings: [],
};

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("create", () => {
	test("routes requests through the bridge endpoint", async () => {
		globalThis.fetch = (async (input, init) => {
			expect(input).toBe("https://example.com/v1/generate");
			expect(new Headers(init?.headers).get("content-type")).toBe(
				"application/json",
			);

			return Response.json(finalResponse);
		}) as typeof globalThis.fetch;

		const client = create({
			baseUrl: "https://example.com/",
		});
		const result = await client.generate(request);

		expect(result.stream).toBe(false);
		if (!result.stream) {
			expect(result.response).toEqual(finalResponse);
		}
	});

	test("returns streaming results without session token tracking", async () => {
		const streamingRequest = { ...request, stream: true } as const;

		globalThis.fetch = (async (input, init) => {
			expect(String(input)).toBe("https://example.com/v1/generate");
			expect(new Headers(init?.headers).get("content-type")).toBe(
				"application/json",
			);

			return new Response(
				[
					"event: done",
					`data: ${JSON.stringify({
						type: "done",
						reason: "stop",
						response: finalResponse,
					})}`,
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

		const client = create({
			baseUrl: "https://example.com",
		});

		const first = await client.generate(streamingRequest);
		expect(first.stream).toBe(true);
		if (first.stream) {
			for await (const _event of first.events) {
				// consume the stream so `final()` resolves
			}
		}

		const second = await client.generate(streamingRequest);
		expect(second.stream).toBe(true);
		if (second.stream) {
			expect(await second.final()).toEqual(finalResponse);
		}
	});

	test("falls back to the default bridge base url when baseUrl is omitted", async () => {
		globalThis.fetch = (async (input) => {
			expect(input).toBe("http://127.0.0.1:4318/v1/generate");
			return Response.json(finalResponse);
		}) as typeof globalThis.fetch;

		const client = create({});
		const result = await client.generate(request);

		expect(result.stream).toBe(false);
	});

	test("forwards origin to client generate requests", async () => {
		globalThis.fetch = (async (input, init) => {
			const headers = new Headers(init?.headers);

			expect(input).toBe("https://example.com/v1/generate");
			expect(headers.get("origin")).toBe("https://app.example.com");
			expect(headers.get("content-type")).toBe("application/json");

			return Response.json(finalResponse);
		}) as typeof globalThis.fetch;

		const client = create({
			baseUrl: "https://example.com",
			origin: " https://app.example.com ",
		});
		const result = await client.generate(request);

		expect(result.stream).toBe(false);
		if (!result.stream) {
			expect(result.response).toEqual(finalResponse);
		}
	});
});
