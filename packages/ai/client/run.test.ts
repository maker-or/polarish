import { afterEach, describe, expect, test } from "bun:test";
import type { AppRequestShapeType, UnifiedResponseType } from "../index.ts";
import { create } from "./create.ts";
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

	test("client run forwards origin to every generate turn", async () => {
		const request: AppRequestShapeType = {
			provider: "anthropic-claude-code",
			model: "claude-sonnet-4-6",
			system: "Use tools when needed.",
			stream: false,
			temperature: 0.2,
			maxRetries: 1,
			messages: [
				{
					role: "user",
					content: "Add 2 and 3.",
					timestamp: 1,
				},
			],
			tools: [
				{
					name: "sum",
					description: "Adds two numbers",
					inputSchema: {
						type: "object",
						properties: {
							a: { type: "number" },
							b: { type: "number" },
						},
						required: ["a", "b"],
					},
					execute: async (input: unknown) => {
						const values = input as { a: number; b: number };
						return { result: values.a + values.b };
					},
				},
			],
		};

		const toolCallResponse: UnifiedResponseType = {
			status: "completed",
			content: [
				{
					type: "tool-call",
					id: "tool_1",
					name: "sum",
					arguments: { a: 2, b: 3 },
				},
			],
			toolCalls: [
				{
					type: "tool-call",
					id: "tool_1",
					name: "sum",
					arguments: { a: 2, b: 3 },
				},
			],
			approvals: [],
			finishReason: "tool-call",
			warnings: [],
		};
		const finalResponse: UnifiedResponseType = {
			status: "completed",
			text: "5",
			content: [{ type: "text", text: "5" }],
			toolCalls: [],
			approvals: [],
			finishReason: "stop",
			warnings: [],
		};
		const responses = [toolCallResponse, finalResponse];
		const seenOrigins: Array<string | null> = [];

		globalThis.fetch = (async (_input, init) => {
			seenOrigins.push(new Headers(init?.headers).get("origin"));
			const response = responses.shift();
			if (response === undefined) {
				throw new Error("unexpected generate call");
			}

			return Response.json(response);
		}) as typeof globalThis.fetch;

		const client = create({
			baseUrl: "https://example.com",
			origin: "https://app.example.com",
		});
		const result = await client.run(request, { maxIterations: 3 });

		if (!("response" in result)) {
			throw new Error("expected batch run result");
		}
		expect(result.iterations).toBe(2);
		expect(result.response.text).toBe("5");
		expect(seenOrigins).toEqual([
			"https://app.example.com",
			"https://app.example.com",
		]);
	});
});
