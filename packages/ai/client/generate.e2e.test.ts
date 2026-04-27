import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	AppRequestShapeType,
	UnifiedGenerateResultType,
} from "../index.ts";
import { create } from "./create.ts";
import { generate } from "./generate.ts";

const executeCodexMock = mock(
	async (
		_request: AppRequestShapeType,
	): Promise<UnifiedGenerateResultType> => ({
		stream: false,
		response: {
			status: "completed",
			text: "default mocked response",
			content: [{ type: "text", text: "default mocked response" }],
			toolCalls: [],
			approvals: [],
			finishReason: "stop",
			providerMetadata: {
				provider: "openai-codex",
			},
			warnings: [],
		},
	}),
);

mock.module("../../../packages/polarish-cli/src/bridge/codex.ts", () => ({
	checkCodexAvailability: async () => ({
		authenticated: true,
		installed: true,
	}),
	executeCodex: (
		request: AppRequestShapeType,
	): Promise<UnifiedGenerateResultType> => executeCodexMock(request),
}));

const { handleBridgeRequest } = await import(
	"../../../packages/polarish-cli/src/bridge/server.ts"
);

const request: AppRequestShapeType = {
	provider: "openai-codex",
	model: "gpt-5.4",
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

function codexSseResponse(args: {
	responseId: string;
	messageId: string;
	model: string;
	delta: string;
}): string {
	return [
		`data: ${JSON.stringify({
			type: "response.created",
			response: {
				id: args.responseId,
				model: args.model,
				status: "in_progress",
			},
		})}`,
		"",
		`data: ${JSON.stringify({
			type: "response.output_item.added",
			output_index: 0,
			sequence_number: 0,
			item: {
				id: args.messageId,
				type: "message",
			},
		})}`,
		"",
		`data: ${JSON.stringify({
			type: "response.output_text.delta",
			content_index: 0,
			delta: args.delta,
			item_id: args.messageId,
			output_index: 0,
			sequence_number: 1,
			logprobs: [],
		})}`,
		"",
		`data: ${JSON.stringify({
			type: "response.output_text.done",
			item_id: args.messageId,
			output_index: 0,
			sequence_number: 2,
			text: args.delta,
			logprobs: [],
		})}`,
		"",
		`data: ${JSON.stringify({
			type: "response.completed",
			response: {
				id: args.responseId,
				model: args.model,
				status: "completed",
				usage: {
					input_tokens: 10,
					output_tokens: 5,
					total_tokens: 15,
				},
			},
		})}`,
		"",
	].join("\n");
}

beforeEach(() => {
	executeCodexMock.mockClear();
});

describe("generate end-to-end", () => {
	test("streams text and resolves final response through the bridge layer", async () => {
		executeCodexMock.mockImplementationOnce(async () => ({
			stream: true,
			textStream: new ReadableStream<string>({
				start(controller) {
					controller.enqueue("Hello from e2e");
					controller.close();
				},
			}),
			events: {
				async *[Symbol.asyncIterator]() {
					yield {
						type: "done",
						reason: "stop",
						response: {
							status: "completed",
							text: "Hello from e2e",
							content: [{ type: "text", text: "Hello from e2e" }],
							toolCalls: [],
							approvals: [],
							finishReason: "stop",
							providerMetadata: {
								provider: "openai-codex",
								responseId: "resp_e2e_1",
							},
							warnings: [],
						},
					};
				},
			},
			async final() {
				return {
					status: "completed",
					text: "Hello from e2e",
					content: [{ type: "text", text: "Hello from e2e" }],
					toolCalls: [],
					approvals: [],
					finishReason: "stop",
					providerMetadata: {
						provider: "openai-codex",
						responseId: "resp_e2e_1",
					},
					warnings: [],
				};
			},
		}));

		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (_input, init) => {
			const body = JSON.parse(String(init?.body));
			return handleBridgeRequest(
				new Request("http://127.0.0.1:4318/v1/generate", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: "http://localhost:3000",
					},
					body: JSON.stringify(body),
				}),
			);
		}) as typeof globalThis.fetch;

		try {
			const result = await generate(request, {
				endpoint: "https://example.com/v1/generate",
				headers: { origin: "http://localhost:3000" },
			});

			expect(result.stream).toBe(true);
			if (!result.stream) {
				throw new Error("expected streaming result");
			}
			const final = await result.final();

			expect(final.text).toBe("Hello from e2e");
			expect(final.providerMetadata?.responseId).toBe("resp_e2e_1");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("returns final JSON through the bridge layer when stream is false", async () => {
		executeCodexMock.mockImplementationOnce(async () => ({
			stream: false,
			response: {
				status: "completed",
				text: "Batch e2e response",
				content: [{ type: "text", text: "Batch e2e response" }],
				toolCalls: [],
				approvals: [],
				finishReason: "stop",
				providerMetadata: {
					provider: "openai-codex",
					responseId: "resp_e2e_2",
				},
				warnings: [],
			},
		}));

		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (_input, init) => {
			const body = JSON.parse(String(init?.body));
			const headers = new Headers(init?.headers);

			expect(headers.get("origin")).toBe("http://localhost:3000");

			return handleBridgeRequest(
				new Request("http://127.0.0.1:4318/v1/generate", {
					method: "POST",
					headers,
					body: JSON.stringify(body),
				}),
			);
		}) as typeof globalThis.fetch;

		try {
			const client = create({
				baseUrl: "https://example.com",
				origin: "http://localhost:3000",
			});
			const result = await client.generate({
				...request,
				stream: false,
			});

			expect(result.stream).toBe(false);
			if (!result.stream) {
				expect(result.response.text).toBe("Batch e2e response");
				expect(result.response.providerMetadata?.responseId).toBe("resp_e2e_2");
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
