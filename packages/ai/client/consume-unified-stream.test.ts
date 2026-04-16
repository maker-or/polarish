import { describe, expect, test } from "bun:test";
import type { UnifiedResponseType } from "../index.ts";
import { consumeUnifiedStream } from "./consume-unified-stream.ts";

function createSseResponse(body: string, init?: ResponseInit): Response {
	return new Response(body, {
		status: 200,
		headers: {
			"content-type": "text/event-stream",
		},
		...init,
	});
}

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

describe("consumeUnifiedStream", () => {
	test("reconstructs textStream and final response from unified SSE", async () => {
		const finalResponse: UnifiedResponseType = {
			status: "completed",
			text: "Hello world",
			content: [{ type: "text", text: "Hello world" }],
			toolCalls: [],
			approvals: [],
			usage: {
				input: 10,
				output: 5,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 15,
				cost: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0,
				},
			},
			finishReason: "stop",
			providerMetadata: {
				provider: "openai-codex",
				responseId: "resp_123",
				messageId: "msg_123",
				model: "gpt-5.4",
			},
			warnings: [],
		};

		const response = createSseResponse(
			[
				"event: text",
				'data: {"delta":"Hello "}',
				"",
				"event: text",
				'data: {"delta":"world"}',
				"",
				"event: final",
				`data: ${JSON.stringify(finalResponse)}`,
				"",
			].join("\n"),
		);

		const result = consumeUnifiedStream(response);
		const chunks = await readTextStream(result.textStream);
		const final = await result.final();

		expect(result.stream).toBe(true);
		expect(chunks).toEqual(["Hello ", "world"]);
		expect(final).toEqual(finalResponse);
	});

	test("rejects final and errors the stream when the machine sends an error event", async () => {
		const response = createSseResponse(
			[
				"event: error",
				`data: ${JSON.stringify({
					type: "error",
					reason: "error",
					error: {
						status: "failed",
						content: [],
						toolCalls: [],
						approvals: [],
						warnings: [],
						finishReason: "error",
						errorMessage: "machine failed",
					},
				})}`,
				"",
			].join("\n"),
		);

		const result = consumeUnifiedStream(response);
		const textError = readTextStream(result.textStream).then(
			() => null,
			(error) => error,
		);
		const finalError = result.final().then(
			() => null,
			(error) => error,
		);

		const textFailure = await textError;
		const finalFailure = await finalError;

		expect(textFailure).toBeInstanceOf(Error);
		expect((textFailure as Error).message).toContain("machine failed");
		expect(finalFailure).toBeInstanceOf(Error);
		expect((finalFailure as Error).message).toContain("machine failed");
	});

	test("exposes pi-mono-shaped events while keeping textStream and final()", async () => {
		const partialBase = {
			status: "in_progress" as const,
			content: [] as { type: "text"; text: string }[],
			toolCalls: [],
			approvals: [],
			warnings: [],
		};
		const finalResponse: UnifiedResponseType = {
			status: "completed",
			text: "Hi",
			content: [{ type: "text", text: "Hi" }],
			toolCalls: [],
			approvals: [],
			finishReason: "stop",
			providerMetadata: { provider: "openai-codex", responseId: "r1" },
			warnings: [],
		};

		const response = createSseResponse(
			[
				"event: start",
				`data: ${JSON.stringify({ type: "start", partial: { ...partialBase, text: "" } })}`,
				"",
				"event: text_start",
				`data: ${JSON.stringify({
					type: "text_start",
					contentIndex: 0,
					partial: { ...partialBase, text: "" },
				})}`,
				"",
				"event: text_delta",
				`data: ${JSON.stringify({
					type: "text_delta",
					contentIndex: 0,
					delta: "Hi",
					partial: { ...partialBase, text: "Hi" },
				})}`,
				"",
				"event: text_end",
				`data: ${JSON.stringify({
					type: "text_end",
					contentIndex: 0,
					content: "Hi",
					partial: { ...partialBase, text: "Hi" },
				})}`,
				"",
				"event: done",
				`data: ${JSON.stringify({
					type: "done",
					reason: "stop",
					response: finalResponse,
				})}`,
				"",
			].join("\n"),
		);

		const result = consumeUnifiedStream(response);
		const kinds: string[] = [];
		for await (const ev of result.events) {
			kinds.push(ev.type);
		}
		const chunks = await readTextStream(result.textStream);
		const final = await result.final();

		expect(kinds).toEqual([
			"start",
			"text_start",
			"text_delta",
			"text_end",
			"done",
		]);
		expect(chunks).toEqual(["Hi"]);
		expect(final).toEqual(finalResponse);
	});
});
