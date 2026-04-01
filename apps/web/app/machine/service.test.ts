import { beforeEach, describe, expect, mock, test } from "bun:test";
import { type AppRequestShapeType, compileRequest } from "@hax/ai";
import { Effect } from "effect";

type AxiosArgs = [string, unknown?, Record<string, unknown>?];
type AxiosResponse = {
	status: number;
	data: unknown;
	headers: Record<string, string | undefined>;
};

let postImpl: (...args: AxiosArgs) => Promise<AxiosResponse>;
let getImpl: (
	url: string,
	config?: Record<string, unknown>,
) => Promise<AxiosResponse>;
let getTokenClaimsImpl: (
	token: string,
) => Promise<{ sub: string; org_id?: string }>;

const axiosPost = mock((...args: AxiosArgs) => postImpl(...args));
const axiosGet = mock((url: string, config?: Record<string, unknown>) =>
	getImpl(url, config),
);
const getTokenClaimsMock = mock((token: string) => getTokenClaimsImpl(token));

mock.module("axios", () => {
	const axios = {
		post: (...args: AxiosArgs) => axiosPost(...args),
		get: (url: string, config?: Record<string, unknown>) =>
			axiosGet(url, config),
	};

	return {
		default: axios,
		post: axios.post,
		get: axios.get,
	};
});

mock.module("@workos-inc/authkit-nextjs", () => ({
	getTokenClaims: (token: string) => getTokenClaimsMock(token),
}));

const { handleRequest } = await import("./service.ts");

const headers = {
	authorization: "Bearer test-token",
};

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
	usage?: {
		input_tokens: number;
		output_tokens: number;
		total_tokens: number;
	};
}): string {
	const usage = args.usage ?? {
		input_tokens: 10,
		output_tokens: 5,
		total_tokens: 15,
	};

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
			item: {
				id: args.messageId,
				type: "message",
			},
		})}`,
		"",
		`data: ${JSON.stringify({
			type: "response.output_text.delta",
			delta: args.delta,
		})}`,
		"",
		`data: ${JSON.stringify({
			type: "response.output_text.done",
		})}`,
		"",
		`data: ${JSON.stringify({
			type: "response.completed",
			response: {
				id: args.responseId,
				model: args.model,
				status: "completed",
				usage,
			},
		})}`,
		"",
	].join("\n");
}

beforeEach(() => {
	axiosPost.mockClear();
	axiosGet.mockClear();
	getTokenClaimsMock.mockClear();
	postImpl = async () => {
		throw new Error("unconfigured axios.post mock");
	};
	getImpl = async () => {
		throw new Error("unconfigured axios.get mock");
	};
	getTokenClaimsImpl = async (token) => {
		expect(token).toBe("test-token");
		return {
			sub: "user-1",
			org_id: "org_1",
		};
	};
});

describe("handleRequest", () => {
	test("rejects the legacy OpenAI-style request body", async () => {
		const result = await Effect.runPromise(
			Effect.either(
				handleRequest(headers, {
					model: "gpt-5.4",
					instructions: "legacy",
					messages: [],
					stream: true,
				}),
			),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("BodyParseError");
			expect(result.left.message).toContain("Invalid request body");
		}
	});

	test("rejects an invalid WorkOS bearer token", async () => {
		getTokenClaimsImpl = async () => {
			const error = new Error("Invalid JWT");
			error.name = "JWTInvalid";
			throw error;
		};

		const result = await Effect.runPromise(
			Effect.either(handleRequest(headers, request)),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("TokenValidationError");
			expect(result.left.message).toContain("Invalid access token");
		}
	});

	test("compiles the unified request and streams unified SSE downstream", async () => {
		const expectedPayload = compileRequest(request);

		postImpl = async (url, data, config) => {
			if (url === "https://chatgpt.com/backend-api/codex/responses") {
				expect(data).toEqual(expectedPayload);
				expect(config?.headers).toMatchObject({
					Authorization: "Bearer access-token",
					"ChatGPT-Account-Id": "acct_123",
					"Content-Type": "application/json",
				});
				expect(config?.responseType).toBe("stream");

				return {
					status: 200,
					data: codexSseResponse({
						responseId: "resp_123",
						messageId: "msg_123",
						model: "gpt-5.4",
						delta: "Hello world",
					}),
					headers: {
						"content-type": "text/event-stream",
						"x-request-id": "up_req_123",
					},
				};
			}

			throw new Error(`unexpected post url: ${url}`);
		};

		getImpl = async (url, config) => {
			expect(url).toBe("https://cautious-platypus-49.convex.site/credentials");
			expect(config?.params).toEqual({
				userId: "user-1",
				provider: "openai-codex",
			});

			return {
				status: 200,
				data: {
					_id: "cred_1",
					_creationTime: 1,
					userId: "user-1",
					orgId: "org_1",
					provider: "openai-codex",
					provider_account_id: "acct_123",
					accessToken: "access-token",
					refresh_token: "refresh-token",
					updatedAt: 1,
				},
				headers: {},
			};
		};

		const response = await Effect.runPromise(handleRequest(headers, request));

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		const body = await response.text();
		expect(body).toContain('event: text\ndata: {"delta":"Hello world"}');
		expect(body).toContain("event: final");
		expect(body).toContain('"text":"Hello world"');
		expect(body).toContain('"responseId":"resp_123"');
		expect(body).toContain('"messageId":"msg_123"');
		expect(response.headers.get("x-request-id")).toBe("up_req_123");
		expect(response.headers.get("x-machine-request-id")).toBeTruthy();
	});

	test("collects the streamed provider response into final unified JSON when stream is false", async () => {
		const nonStreamingRequest = {
			...request,
			stream: false,
		} satisfies AppRequestShapeType;
		const expectedPayload = {
			...compileRequest(nonStreamingRequest),
			stream: true,
		};

		postImpl = async (url, data, config) => {
			if (url === "https://chatgpt.com/backend-api/codex/responses") {
				expect(data).toEqual(expectedPayload);
				expect(config?.responseType).toBe("stream");

				return {
					status: 200,
					data: codexSseResponse({
						responseId: "resp_789",
						messageId: "msg_789",
						model: "gpt-5.4",
						delta: "Collected response",
					}),
					headers: {
						"content-type": "text/event-stream",
					},
				};
			}

			throw new Error(`unexpected post url: ${url}`);
		};

		getImpl = async () => ({
			status: 200,
			data: {
				_id: "cred_1",
				_creationTime: 1,
				userId: "user-1",
				orgId: "org_1",
				provider: "openai-codex",
				accessToken: "access-token",
				refresh_token: "refresh-token",
				updatedAt: 1,
			},
			headers: {},
		});

		const response = await Effect.runPromise(
			handleRequest(headers, nonStreamingRequest),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(await response.json()).toEqual({
			text: "Collected response",
			content: [{ type: "text", text: "Collected response" }],
			toolCalls: [],
			toolResults: [],
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
				responseId: "resp_789",
				messageId: "msg_789",
				model: "gpt-5.4",
			},
			warnings: [],
		});
	});

	test("refreshes the access token after an upstream 401", async () => {
		const expectedPayload = compileRequest(request);

		postImpl = async (url, data, config) => {
			if (url === "https://chatgpt.com/backend-api/codex/responses") {
				expect(data).toEqual(expectedPayload);

				const authHeader = (config?.headers as Record<string, string>)
					.Authorization;
				if (authHeader === "Bearer stale-token") {
					return {
						status: 401,
						data: { error: "expired" },
						headers: {},
					};
				}

				if (authHeader === "Bearer refreshed-token") {
					return {
						status: 200,
						data: codexSseResponse({
							responseId: "resp_456",
							messageId: "msg_456",
							model: "gpt-5.4",
							delta: "Hello again",
						}),
						headers: {
							"content-type": "text/event-stream",
						},
					};
				}
			}

			if (url === "https://auth.openai.com/oauth/token") {
				return {
					status: 200,
					data: { access_token: "refreshed-token" },
					headers: {},
				};
			}

			throw new Error(`unexpected post url: ${url}`);
		};

		getImpl = async () => ({
			status: 200,
			data: {
				_id: "cred_1",
				_creationTime: 1,
				userId: "user-1",
				orgId: "org_1",
				provider: "openai-codex",
				accessToken: "stale-token",
				refresh_token: "refresh-token",
				updatedAt: 1,
			},
			headers: {},
		});

		const response = await Effect.runPromise(handleRequest(headers, request));

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('"delta":"Hello again"');
	});
});
