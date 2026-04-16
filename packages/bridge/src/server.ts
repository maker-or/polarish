import {
	type IncomingMessage,
	type ServerResponse,
	createServer,
} from "node:http";
import { executeCodex } from "./codex.js";
import { type BridgeConfig, DEFAULT_BRIDGE_CONFIG } from "./config.js";
import {
	type AppRequestShapeType,
	type UnifiedGenerateResultType,
	type UnifiedStreamEventPayload,
	unifiedResponseForStreamError,
} from "./contracts.js";
import { BridgeError, bridgeErrorResponse } from "./errors.js";
import { isAllowedOrigin } from "./security.js";

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

			return applyCorsHeaders(
				new Response(null, { status: 204 }),
				origin,
				config,
			);
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
		const parsed = parseGenerateRequest(body);
		const result = await executeCodex(parsed, {
			signal: request.signal,
			transport: "sse",
		});
		return applyCorsHeaders(resultToResponse(result), origin, config);
	} catch (error) {
		return applyCorsHeaders(bridgeErrorResponse(error), origin, config);
	}
}

/**
 * This starts the Node.js HTTP bridge server on the configured port.
 */
export function startBridgeServer(
	config: BridgeConfig = DEFAULT_BRIDGE_CONFIG,
) {
	const server = createServer(async (req, res) => {
		const response = await handleBridgeRequest(
			await nodeRequestToFetchRequest(req),
			config,
		);
		await writeFetchResponse(res, response);
	});
	server.listen(config.server.port);
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

	if (body.provider !== "openai-codex") {
		throw new BridgeError({
			status: 400,
			code: "unsupported_provider",
			message: "The bridge only supports the openai-codex provider in v1.",
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

	return body as AppRequestShapeType;
}

function resultToResponse(result: UnifiedGenerateResultType): Response {
	if (!result.stream) {
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
					controller.enqueue(encodeSseEvent(event.type, event));
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const payload: UnifiedStreamEventPayload = {
					type: "error",
					reason: "error",
					error: unifiedResponseForStreamError(message),
				};
				controller.enqueue(encodeSseEvent("error", payload));
			} finally {
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
