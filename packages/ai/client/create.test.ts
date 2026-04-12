import { afterEach, describe, expect, test } from "bun:test";
import type { AppRequestShapeType, UnifiedResponseType } from "../index.ts";
import { create } from "./create.ts";

const originalFetch = globalThis.fetch;

const request: AppRequestShapeType = {
	provider: "openai-codex",
	model: "gpt-5.4",
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
		provider: "openai-codex",
	},
	warnings: [],
};

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("create", () => {
	test("routes requests through the machine endpoint with bearer auth", async () => {
		globalThis.fetch = (async (input, init) => {
			expect(input).toBe("https://example.com/api/v1/chat/completions");

			const headers = new Headers(init?.headers);
			expect(headers.get("authorization")).toBe("Bearer access-token");
			expect(headers.get("content-type")).toBe("application/json");

			return Response.json(finalResponse);
		}) as typeof globalThis.fetch;

		const client = create({
			accessToken: "  access-token  ",
			refreshToken: "refresh-token",
			clientId: "client-id",
			clientSecret: "client-secret",
			baseUrl: "https://example.com/",
		});
		const result = await client.generate(request);

		expect(result.stream).toBe(false);
		if (!result.stream) {
			expect(result.response).toEqual(finalResponse);
		}
	});

	test("refreshes the access token once and retries the request", async () => {
		let machineCallCount = 0;
		let refreshCallCount = 0;

		globalThis.fetch = (async (input, init) => {
			const url = String(input);

			if (url === "https://example.com/api/v1/chat/completions") {
				machineCallCount += 1;
				const headers = new Headers(init?.headers);

				if (machineCallCount === 1) {
					expect(headers.get("authorization")).toBe("Bearer expired-token");
					return new Response(
						JSON.stringify({
							error: {
								message: "Access token expired",
								type: "invalid_request_error",
								code: "invalid_api_key",
								param: null,
							},
						}),
						{
							status: 401,
							headers: {
								"content-type": "application/json",
							},
						},
					);
				}

				expect(headers.get("authorization")).toBe("Bearer fresh-token");
				return Response.json(finalResponse);
			}

			if (url === "/api/auth/refresh") {
				refreshCallCount += 1;
				expect(init?.method).toBe("POST");
				expect(new Headers(init?.headers).get("content-type")).toBe(
					"application/x-www-form-urlencoded",
				);

				const body = new URLSearchParams(String(init?.body));
				expect(body.get("refresh_token")).toBe("refresh-token");

				return Response.json({
					access_token: "fresh-token",
					refresh_token: "rotated-refresh-token",
					token_type: "bearer",
					expires_in: 3600,
				});
			}

			throw new Error(`unexpected fetch url: ${url}`);
		}) as typeof globalThis.fetch;

		const client = create({
			accessToken: "expired-token",
			refreshToken: "refresh-token",
			clientId: "client-id",
			clientSecret: "client-secret",
			baseUrl: "https://example.com",
		});

		const result = await client.generate(request);

		expect(machineCallCount).toBe(2);
		expect(refreshCallCount).toBe(1);
		expect(result.stream).toBe(false);
		if (!result.stream) {
			expect(result.response).toEqual(finalResponse);
		}
	});

	test("persists rotated session tokens from the final machine response", async () => {
		const seenTokens: { accessToken: string; refreshToken: string }[] = [];
		const seenAuthHeaders: string[] = [];

		globalThis.fetch = (async (input, init) => {
			const url = String(input);
			expect(url).toBe("https://example.com/api/v1/chat/completions");

			const headers = new Headers(init?.headers);
			seenAuthHeaders.push(headers.get("authorization") ?? "");

			return Response.json({
				...finalResponse,
				sessionTokens: {
					accessToken: "server-rotated-token",
					refreshToken: "server-rotated-refresh-token",
				},
			});
		}) as typeof globalThis.fetch;

		const client = create({
			accessToken: "access-token",
			refreshToken: "refresh-token",
			clientId: "client-id",
			clientSecret: "client-secret",
			baseUrl: "https://example.com",
			onSessionTokens: async (tokens) => {
				seenTokens.push(tokens);
			},
		});

		await client.generate(request);
		await client.generate(request);

		expect(seenTokens).toEqual([
			{
				accessToken: "server-rotated-token",
				refreshToken: "server-rotated-refresh-token",
			},
			{
				accessToken: "server-rotated-token",
				refreshToken: "server-rotated-refresh-token",
			},
		]);
		expect(seenAuthHeaders).toEqual([
			"Bearer access-token",
			"Bearer server-rotated-token",
		]);
	});

	test("updates session tokens from the streaming done event", async () => {
		const seenTokens: { accessToken: string; refreshToken: string }[] = [];
		const seenAuthHeaders: string[] = [];
		const streamingRequest = { ...request, stream: true } as const;

		globalThis.fetch = (async (input, init) => {
			const url = String(input);
			expect(url).toBe("https://example.com/api/v1/chat/completions");

			const headers = new Headers(init?.headers);
			seenAuthHeaders.push(headers.get("authorization") ?? "");

			return new Response(
				[
					"event: done",
					`data: ${JSON.stringify({
						type: "done",
						reason: "stop",
						message: {
							...finalResponse,
							sessionTokens: {
								accessToken: "stream-rotated-token",
								refreshToken: "stream-rotated-refresh-token",
							},
						},
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
			accessToken: "access-token",
			refreshToken: "refresh-token",
			clientId: "client-id",
			clientSecret: "client-secret",
			baseUrl: "https://example.com",
			onSessionTokens: async (tokens) => {
				seenTokens.push(tokens);
			},
		});

		const first = await client.generate(streamingRequest);
		expect(first.stream).toBe(true);
		if (first.stream) {
			for await (const _event of first.events) {
				// consume the stream so the done event is applied
			}
		}

		const second = await client.generate(streamingRequest);
		expect(second.stream).toBe(true);
		if (second.stream) {
			await second.final();
		}

		expect(seenTokens).toEqual([
			{
				accessToken: "stream-rotated-token",
				refreshToken: "stream-rotated-refresh-token",
			},
			{
				accessToken: "stream-rotated-token",
				refreshToken: "stream-rotated-refresh-token",
			},
		]);
		expect(seenAuthHeaders).toEqual([
			"Bearer access-token",
			"Bearer stream-rotated-token",
		]);
	});

	test("falls back to the default base url when baseUrl is omitted", async () => {
		globalThis.fetch = (async (input) => {
			expect(input).toBe(
				"https://your-default-polaris-url/api/v1/chat/completions",
			);
			return Response.json(finalResponse);
		}) as typeof globalThis.fetch;

		const client = create({
			accessToken: "access-token",
			refreshToken: "refresh-token",
			clientId: "client-id",
			clientSecret: "client-secret",
		});
		const result = await client.generate(request);

		expect(result.stream).toBe(false);
	});
});
