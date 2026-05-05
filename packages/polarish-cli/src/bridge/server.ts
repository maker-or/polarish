import { randomUUID } from "node:crypto";
import {
	type IncomingMessage,
	type ServerResponse,
	createServer,
} from "node:http";
import { readBridgeConfig } from "../lib/bridge-config.js";
import { executeClaudeCode } from "./claude-code.js";
import { executeCodex } from "./codex.js";
import { type BridgeConfig, DEFAULT_BRIDGE_CONFIG } from "./config.js";
import {
	type AppRequestShapeType,
	type UnifiedGenerateResultType,
	type UnifiedStreamEventPayload,
	unifiedResponseForStreamError,
} from "./contracts.js";
import { BridgeError, bridgeErrorResponse } from "./errors.js";
import {
	resolveClaudeExecutable,
	resolveCodexExecutable,
} from "./executable-paths.js";
import { isAllowedOrigin, isLocalhostToolCallbackUrl } from "./security.js";
import {
	type ExecuteContext,
	createBridgeRequestLogger,
	summarizeAppRequest,
} from "./shared.js";

function corsHeaders(origin: string | null, config: BridgeConfig): HeadersInit {
	if (!isAllowedOrigin(origin, config.security.allowedOrigins)) {
		return {};
	}

	// `Origin` is required for the CORS headers to be meaningful in the browser.
	if (!origin) {
		return {};
	}

	return {
		"access-control-allow-origin": origin,
		"access-control-allow-methods": "POST, OPTIONS",
		"access-control-allow-headers": "content-type",
		"access-control-max-age": "86400",
		vary: "Origin",
	};
}

function applyCorsHeaders(
	response: Response,
	origin: string | null,
	config: BridgeConfig,
) {
	const headers = corsHeaders(origin, config);
	for (const [key, value] of Object.entries(headers)) {
		response.headers.set(key, String(value));
	}
	return response;
}

/**
 * This handles one incoming bridge request using the configured runtime and security rules.
 */
export async function handleBridgeRequest(
	request: Request,
	config: BridgeConfig = DEFAULT_BRIDGE_CONFIG,
): Promise<Response> {
	const origin = request.headers.get("origin");
	const requestId = randomUUID();
	const logger = createBridgeRequestLogger(requestId, "server");
	logger.log("bridge request received", {
		method: request.method,
		url: request.url,
		origin,
	});

	try {
		const url = new URL(request.url);
		if (url.pathname !== "/v1/generate") {
			throw new BridgeError({
				status: 404,
				code: "not_found",
				message: "The bridge route was not found.",
			});
		}

		// Browser preflight for `fetch(..., { method: "POST", content-type: "application/json" })`.
		// We must respond to `OPTIONS` with CORS headers or the browser will block the real request.
		if (request.method === "OPTIONS") {
			logger.log("handling cors preflight");
			if (!isAllowedOrigin(origin, config.security.allowedOrigins)) {
				throw new BridgeError({
					status: 403,
					code: "origin_not_allowed",
					message:
						"This browser origin is not allowed to call the local bridge.",
					detail: origin
						? `Rejected origin: ${origin}`
						: "Missing Origin header.",
					suggestedAction:
						"Add this origin to the bridge config with the CLI and retry the request.",
				});
			}

			const response = applyCorsHeaders(
				new Response(null, { status: 204 }),
				origin,
				config,
			);
			logger.log("cors preflight complete", {
				status: response.status,
			});
			return response;
		}

		if (request.method !== "POST") {
			throw new BridgeError({
				status: 405,
				code: "method_not_allowed",
				message: "The bridge only accepts POST on /v1/generate.",
			});
		}

		if (!isAllowedOrigin(origin, config.security.allowedOrigins)) {
			throw new BridgeError({
				status: 403,
				code: "origin_not_allowed",
				message: "This browser origin is not allowed to call the local bridge.",
				detail: origin
					? `Rejected origin: ${origin}`
					: "Missing Origin header.",
				suggestedAction:
					"Add this origin to the bridge config with the CLI and retry the request.",
			});
		}

		const body = await request.json();
		logger.log("request body parsed");
		const parsed = parseGenerateRequest(body);
		logger.log("request validated", summarizeAppRequest(parsed));
		const result = await executeProviderRequest(parsed, {
			requestId,
			signal: request.signal,
			transport: "sse",
			codexExecutable: resolveCodexExecutable(config),
			claudeExecutable: resolveClaudeExecutable(config),
		});
		logger.log("provider execution completed", {
			stream: result.stream,
		});
		const response = applyCorsHeaders(
			resultToResponse(result, logger.scope("response")),
			origin,
			config,
		);
		logger.log("bridge request completed", {
			status: response.status,
			responseType: response.headers.get("content-type"),
		});
		return response;
	} catch (error) {
		logger.error("bridge request failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		const response = applyCorsHeaders(
			bridgeErrorResponse(error),
			origin,
			config,
		);
		logger.log("bridge error response sent", {
			status: response.status,
		});
		return response;
	}
}

/**
 * This starts the Node HTTP bridge. The listen port is taken from `listenConfig` once; security allowlist and related settings are re-read from disk on every request so origin changes apply without restarting the process.
 */
export function startBridgeServer(
	listenConfig: BridgeConfig = DEFAULT_BRIDGE_CONFIG,
) {
	const server = createServer(async (req, res) => {
		const liveConfig = await readBridgeConfig();
		const response = await handleBridgeRequest(
			await nodeRequestToFetchRequest(req),
			liveConfig,
		);
		await writeFetchResponse(res, response);
	});
	server.listen(listenConfig.server.port);
	return server;
}

function parseGenerateRequest(body: unknown): AppRequestShapeType {
	if (!isRecord(body)) {
		throw new BridgeError({
			status: 400,
			code: "invalid_request",
			message: "The bridge request body must be a JSON object.",
		});
	}

	if (
		body.provider !== "openai-codex" &&
		body.provider !== "anthropic-claude-code"
	) {
		throw new BridgeError({
			status: 400,
			code: "unsupported_provider",
			message:
				"The bridge only supports the openai-codex and anthropic-claude-code providers in v1.",
			detail:
				typeof body.provider === "string"
					? `Unsupported provider: ${body.provider}`
					: "Missing provider.",
		});
	}

	if (typeof body.model !== "string") {
		throw new BridgeError({
			status: 400,
			code: "invalid_request",
			message: "The bridge request is missing a valid `model` string.",
		});
	}

	if (typeof body.system !== "string") {
		throw new BridgeError({
			status: 400,
			code: "invalid_request",
			message: "The bridge request is missing a valid `system` string.",
		});
	}

	if (typeof body.stream !== "boolean") {
		throw new BridgeError({
			status: 400,
			code: "invalid_request",
			message: "The bridge request is missing a valid `stream` boolean.",
		});
	}

	if (!Array.isArray(body.messages)) {
		throw new BridgeError({
			status: 400,
			code: "invalid_request",
			message: "The bridge request is missing a valid `messages` array.",
		});
	}

	if (
		typeof body.temperature !== "number" ||
		typeof body.maxRetries !== "number"
	) {
		throw new BridgeError({
			status: 400,
			code: "invalid_request",
			message:
				"The bridge request is missing numeric `temperature` or `maxRetries` fields.",
		});
	}

	const parsed = body as AppRequestShapeType;
	if (parsed.mcpServers !== undefined) {
		if (!isMcpServersRecord(parsed.mcpServers)) {
			throw new BridgeError({
				status: 400,
				code: "invalid_request",
				message:
					"When set, `mcpServers` must be an object whose values are `{ command: string, args?: string[], env?: Record<string,string> }`.",
			});
		}
	}

	if (parsed.toolExecution !== undefined) {
		if (parsed.provider !== "openai-codex") {
			throw new BridgeError({
				status: 400,
				code: "invalid_request",
				message:
					"`toolExecution` is only supported when `provider` is `openai-codex`.",
			});
		}
		if (!isRecord(parsed.toolExecution)) {
			throw new BridgeError({
				status: 400,
				code: "invalid_request",
				message:
					"When set, `toolExecution` must be an object with `callbackUrl` and `bearerToken` strings.",
			});
		}
		const callbackUrl = parsed.toolExecution.callbackUrl;
		const bearerToken = parsed.toolExecution.bearerToken;
		if (typeof callbackUrl !== "string" || typeof bearerToken !== "string") {
			throw new BridgeError({
				status: 400,
				code: "invalid_request",
				message:
					"`toolExecution.callbackUrl` and `toolExecution.bearerToken` must be strings.",
			});
		}
		if (!isLocalhostToolCallbackUrl(callbackUrl)) {
			throw new BridgeError({
				status: 400,
				code: "invalid_request",
				message:
					"`toolExecution.callbackUrl` must be an http(s) URL on localhost or 127.0.0.1.",
				detail: callbackUrl,
			});
		}
		if (bearerToken.length < 16) {
			throw new BridgeError({
				status: 400,
				code: "invalid_request",
				message:
					"`toolExecution.bearerToken` is too short — use a long random secret.",
			});
		}
	}

	return parsed;
}

/**
 * This dispatches one validated request to the matching local provider harness.
 */
async function executeProviderRequest(
	request: AppRequestShapeType,
	context: ExecuteContext,
): Promise<UnifiedGenerateResultType> {
	switch (request.provider) {
		case "openai-codex":
			return executeCodex(request, context);
		case "anthropic-claude-code":
			return executeClaudeCode(request, context);
		default:
			throw new BridgeError({
				status: 400,
				code: "unsupported_provider",
				message:
					"The bridge received an unsupported provider after validation.",
				detail: `Unsupported provider: ${String(request.provider)}`,
			});
	}
}

function resultToResponse(
	result: UnifiedGenerateResultType,
	logger = createBridgeRequestLogger("no-request-id", "server/response"),
): Response {
	if (!result.stream) {
		logger.log("serializing batch response", {
			finishReason: result.response.finishReason,
			toolCalls: result.response.toolCalls.length,
		});
		return Response.json(result.response, {
			status: 200,
			headers: {
				"content-type": "application/json; charset=utf-8",
			},
		});
	}

	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const event of result.events) {
					logger.log("forwarding stream event", {
						type: event.type,
					});
					controller.enqueue(encodeSseEvent(event.type, event));
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error("stream forwarding failed", {
					error: message,
				});
				const payload: UnifiedStreamEventPayload = {
					type: "error",
					reason: "error",
					error: unifiedResponseForStreamError(message),
				};
				controller.enqueue(encodeSseEvent("error", payload));
			} finally {
				logger.log("stream response closed");
				controller.close();
			}
		},
	});

	return new Response(body, {
		status: 200,
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache",
			"x-accel-buffering": "no",
		},
	});
}

function encodeSseEvent(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(
		`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
	);
}

async function nodeRequestToFetchRequest(
	request: IncomingMessage,
): Promise<Request> {
	const protocol = "http";
	const host = request.headers.host ?? "127.0.0.1";
	const url = `${protocol}://${host}${request.url ?? "/"}`;
	const body = await readRequestBody(request);
	return new Request(url, {
		method: request.method,
		headers: request.headers as HeadersInit,
		...(body.length > 0 ? { body } : {}),
	});
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
	let body = "";
	for await (const chunk of request) {
		body +=
			typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
	}
	return body;
}

async function writeFetchResponse(
	response: ServerResponse<IncomingMessage> & { req?: IncomingMessage },
	fetchResponse: Response,
): Promise<void> {
	const headers: Record<string, string> = {};
	fetchResponse.headers.forEach((value, key) => {
		headers[key] = value;
	});
	response.writeHead(fetchResponse.status, headers);

	if (!fetchResponse.body) {
		response.end();
		return;
	}

	const reader = fetchResponse.body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			response.write(Buffer.from(value));
		}
		response.end();
	} finally {
		reader.releaseLock();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMcpServersRecord(
	value: unknown,
): value is NonNullable<AppRequestShapeType["mcpServers"]> {
	if (!isRecord(value)) {
		return false;
	}
	for (const entry of Object.values(value)) {
		if (!isRecord(entry) || typeof entry.command !== "string") {
			return false;
		}
		if (entry.args !== undefined && !Array.isArray(entry.args)) {
			return false;
		}
		if (
			entry.args !== undefined &&
			!entry.args.every((a) => typeof a === "string")
		) {
			return false;
		}
		if (entry.env !== undefined) {
			if (!isRecord(entry.env)) {
				return false;
			}
			if (!Object.values(entry.env).every((v) => typeof v === "string")) {
				return false;
			}
		}
	}
	return true;
}
