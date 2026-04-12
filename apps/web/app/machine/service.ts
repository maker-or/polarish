import {
	type AppRequestShapeType,
	type UnifiedResponseType,
	appRequestShape,
	approvalToolConfigFromRequest,
	codexUnifiedStreamEvents,
	compileRequest,
	emptyAccumulator,
	mapChunk,
	openaiCodex,
	toUnifiedSnapshot,
	unifiedResponseForStreamError,
} from "@hax/ai";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { getTokenClaims } from "@workos-inc/authkit-nextjs";
import axios from "axios";
import type { AxiosResponse } from "axios";
import { Data, Effect, Either, ParseResult, Schedule, Schema } from "effect";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import {
	type BearerHeaders,
	CredentialLookupRequest,
	CredentialLookupResponse,
	OpenAIRefreshTokenResponse,
	WorkOSAccessTokenClaims,
} from "./model";

class MissingAuthHeader extends Data.TaggedError("MissingAuthHeader")<
	Record<string, never>
> {}
class NetworkError extends Data.TaggedError("NetworkError")<{
	cause: unknown;
}> {}
class TokenValidationError extends Data.TaggedError("TokenValidationError")<{
	message: string;
	status?: number;
}> {}
class BodyParseError extends Data.TaggedError("BodyParseError")<{
	message: string;
}> {}
class UpstreamError extends Data.TaggedError("UpstreamError")<{
	message: string;
	status?: number;
}> {}
class RateLimitError extends Data.TaggedError("RateLimitError")<{
	message: string;
}> {}

export type MachineError =
	| MissingAuthHeader
	| NetworkError
	| TokenValidationError
	| BodyParseError
	| UpstreamError
	| RateLimitError;

const logger = logs.getLogger("my-app");
const tracer = trace.getTracer("machine-service", "1.0.0");

const INFO_SEVERITY_NUMBER = 9;
const WARN_SEVERITY_NUMBER = 13;
const ERROR_SEVERITY_NUMBER = 17;

type CanonicalContext = {
	requestId: string;
	userId?: string;
	organizationId?: string;
	traceId?: string;
	startedAt: number;
	outcome: "success" | "error";
	httpStatus?: number;
	errorType?: MachineError["_tag"];
	errorMessage?: string;
	tokenValidationStatus?: number;
	tokenValid?: boolean;
	modelId?: string;
	upstreamModel?: string;
	provider?: string;
	providerHost?: string;
	upstreamStatus?: number;
	stream?: boolean;
};

type ResolvedBody = {
	request: AppRequestShapeType;
	providerName: AppRequestShapeType["provider"];
	upstreamUrl: string;
	upstreamPayload: ReturnType<typeof compileRequest>;
};

type UpstreamPayload =
	| ReadableStream<Uint8Array | string>
	| AsyncIterable<Uint8Array | string>
	| string
	| Uint8Array
	| object;

/**
 * This is the rotated token pair that the machine can return after a refresh.
 */
type RotatedSessionTokens = {
	accessToken: string;
	refreshToken: string;
};

function hashString(value: string): number {
	let hash = 0;
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
	}
	return hash;
}

function failureLevel(tag: MachineError["_tag"]): "warn" | "error" {
	if (
		tag === "MissingAuthHeader" ||
		tag === "TokenValidationError" ||
		tag === "BodyParseError" ||
		tag === "NetworkError" ||
		tag === "RateLimitError"
	) {
		return "warn";
	}
	return "error";
}

function statusFromError(error: MachineError): number {
	switch (error._tag) {
		case "MissingAuthHeader":
		case "TokenValidationError":
			return 401;
		case "BodyParseError":
			return 400;
		case "NetworkError":
			return 503;
		case "RateLimitError":
			return 429;
		case "UpstreamError":
			return 502;
	}
}

function messageFromError(error: MachineError): string {
	if (
		error._tag === "TokenValidationError" ||
		error._tag === "BodyParseError" ||
		error._tag === "RateLimitError" ||
		error._tag === "UpstreamError"
	) {
		return error.message;
	}
	if (error._tag === "MissingAuthHeader") {
		return "Missing authorization header";
	}
	return "Network request failed";
}

function emitCanonicalLog(context: CanonicalContext): void {
	const level =
		context.outcome === "success"
			? "info"
			: failureLevel(context.errorType ?? "UpstreamError");

	const durationMs = Date.now() - context.startedAt;
	const attributes: Record<string, string | number | boolean | null> = {
		"event.name": "machine.request",
		"event.kind": "canonical",
		"machine.request_id": context.requestId,
		"machine.trace_id": context.traceId ?? null,
		"machine.organization_id": context.organizationId ?? null,
		"machine.outcome": context.outcome,
		"machine.duration_ms": durationMs,
		"machine.status": context.httpStatus ?? null,
		"machine.error_type": context.errorType ?? null,
		"machine.error_message": context.errorMessage ?? null,
		"machine.token_validation_status": context.tokenValidationStatus ?? null,
		"machine.token_valid": context.tokenValid ?? null,
		"machine.model_id": context.modelId ?? null,
		"machine.upstream_model": context.upstreamModel ?? null,
		"machine.provider": context.provider ?? null,
		"machine.provider_host": context.providerHost ?? null,
		"machine.upstream_status": context.upstreamStatus ?? null,
		"machine.stream": context.stream ?? null,
	};

	logger.emit({
		severityText: level.toUpperCase(),
		severityNumber:
			level === "error"
				? ERROR_SEVERITY_NUMBER
				: level === "warn"
					? WARN_SEVERITY_NUMBER
					: INFO_SEVERITY_NUMBER,
		body: "machine.request",
		attributes,
	});
}

function decodeWithSchema<A, I, E>(
	schema: Schema.Schema<A, I, never>,
	input: unknown,
	onError: (message: string) => E,
): Effect.Effect<A, E> {
	return Either.match(Schema.decodeUnknownEither(schema)(input), {
		onLeft: (error) =>
			Effect.fail(onError(ParseResult.TreeFormatter.formatErrorSync(error))),
		onRight: (value) => Effect.succeed(value),
	});
}

/**
 * This tells the machine whether a token failure should be surfaced as an
 * auth problem or an upstream/network problem.
 */
function isJwtValidationError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	return (
		error.name.startsWith("JWT") ||
		error.name.startsWith("JWK") ||
		error.message.toLowerCase().includes("token")
	);
}

function stringifyUnknown(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (value == null) {
		return "";
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function encodeSseEvent(event: string, data: unknown): Uint8Array {
	const payload = typeof data === "string" ? data : JSON.stringify(data);
	return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
}

async function* iterateBodyChunks(
	body: UpstreamPayload,
): AsyncGenerator<string, void, void> {
	const decoder = new TextDecoder();

	if (typeof body === "string") {
		yield body;
		return;
	}

	if (body instanceof Uint8Array) {
		yield decoder.decode(body);
		return;
	}

	if (body instanceof ReadableStream) {
		const reader = body.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (typeof value === "string") {
					yield value;
				} else if (value instanceof Uint8Array) {
					yield decoder.decode(value, { stream: true });
				} else if (value !== undefined) {
					yield String(value);
				}
			}
		} finally {
			reader.releaseLock();
		}
		return;
	}

	if (body && typeof body === "object" && Symbol.asyncIterator in body) {
		for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
			if (typeof chunk === "string") {
				yield chunk;
			} else {
				yield decoder.decode(chunk, { stream: true });
			}
		}
		return;
	}

	yield stringifyUnknown(body);
}

/**
 * This reads an upstream error payload into text so machine errors include the real provider message.
 */
async function readUpstreamErrorBody(body: UpstreamPayload): Promise<string> {
	let result = "";

	for await (const chunk of iterateBodyChunks(body)) {
		result += chunk;
	}

	return result.trim();
}

async function* parseCodexEvents(
	body: UpstreamPayload,
): AsyncGenerator<ResponseStreamEvent, void, void> {
	let buffer = "";

	const parseFrame = (rawFrame: string): ResponseStreamEvent | undefined => {
		const frame = rawFrame.replace(/\r\n/g, "\n");
		const dataLines = frame
			.split("\n")
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trim())
			.filter((line) => line.length > 0);

		if (dataLines.length === 0) {
			return undefined;
		}

		const data = dataLines.join("\n");
		if (data === "[DONE]") {
			return undefined;
		}

		return JSON.parse(data) as ResponseStreamEvent;
	};

	for await (const chunk of iterateBodyChunks(body)) {
		buffer += chunk;

		while (true) {
			const separatorIndex = buffer.indexOf("\n\n");
			if (separatorIndex === -1) break;

			const frame = buffer.slice(0, separatorIndex);
			buffer = buffer.slice(separatorIndex + 2);
			const parsed = parseFrame(frame);
			if (parsed !== undefined) {
				yield parsed;
			}
		}
	}

	const trailingFrame = buffer.trim();
	if (trailingFrame.length > 0) {
		const parsed = parseFrame(trailingFrame);
		if (parsed !== undefined) {
			yield parsed;
		}
	}
}

/**
 * This is used when the stream is false
 */
async function collectUnifiedResponse(
	body: UpstreamPayload,
	sessionTokens?: RotatedSessionTokens,
): Promise<UnifiedResponseType> {
	let acc = emptyAccumulator();

	for await (const event of parseCodexEvents(body)) {
		acc = mapChunk(acc, event);
	}

	if (!acc.completed) {
		throw new UpstreamError({
			message: "Upstream stream ended before response.completed",
		});
	}

	return {
		...toUnifiedSnapshot(acc),
		...(sessionTokens ? { sessionTokens } : {}),
	};
}

/**
 * This particular function is used when the stream is true
 */
function createUnifiedStreamingResponse(
	body: UpstreamPayload,
	headers: Headers,
	options: {
		runId: string;
		tools: AppRequestShapeType["tools"];
		sessionTokens?: RotatedSessionTokens;
	},
): Response {
	const approvalByToolName = approvalToolConfigFromRequest(options.tools);
	const toolCallStartSent = new Set<string>();
	const toolCallEndSent = new Set<string>();
	const textBlockStarted = new Set<number>();
	const reasoningSummaryStarted = new Set<number>();
	const reasoningTextStarted = new Set<number>();

	const responseStream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let acc = emptyAccumulator();

			try {
				for await (const event of parseCodexEvents(body)) {
					acc = mapChunk(acc, event);
					const frames = codexUnifiedStreamEvents({
						event,
						next: acc,
						runId: options.runId,
						approvalByToolName,
						toolCallStartSent,
						toolCallEndSent,
						textBlockStarted,
						reasoningSummaryStarted,
						reasoningTextStarted,
					});
					for (const frame of frames) {
						const frameWithSessionTokens =
							frame.type === "done" && options.sessionTokens
								? {
										...frame,
										message: {
											...frame.message,
											sessionTokens: options.sessionTokens,
										},
									}
								: frame;
						controller.enqueue(
							encodeSseEvent(
								frameWithSessionTokens.type,
								frameWithSessionTokens,
							),
						);
					}
				}

				if (!acc.completed) {
					throw new UpstreamError({
						message: "Upstream stream ended before response.completed",
					});
				}

				controller.close();
			} catch (error) {
				controller.enqueue(
					encodeSseEvent("error", {
						type: "error",
						reason: "error",
						error: unifiedResponseForStreamError(stringifyUnknown(error)),
					}),
				);
				controller.close();
			}
		},
	});

	const responseHeaders = new Headers(headers);
	responseHeaders.set("content-type", "text/event-stream; charset=utf-8");
	responseHeaders.set("x-accel-buffering", "no");
	responseHeaders.set("cache-control", "no-cache");

	return new Response(responseStream, {
		status: 200,
		headers: responseHeaders,
	});
}

function validateToken(
	header: BearerHeaders,
	context: CanonicalContext,
): Effect.Effect<
	void,
	MissingAuthHeader | NetworkError | TokenValidationError
> {
	const span = tracer.startSpan("machine.validate_token");
	span.setAttribute("machine.request_id", context.requestId);

	const effect = Effect.gen(function* () {
		if (!header.authorization?.startsWith("Bearer ")) {
			yield* Effect.fail(new MissingAuthHeader({}));
			return undefined as never;
		}

		const token = header.authorization.replace("Bearer ", "").trim();
		span.setAttribute("machine.token_hash", hashString(token).toString());

		const rawClaims = yield* Effect.tryPromise({
			try: () => getTokenClaims(token),
			catch: (cause) => cause,
		}).pipe(
			Effect.catchAll((cause) =>
				Effect.fail(
					isJwtValidationError(cause)
						? new TokenValidationError({
								message:
									cause instanceof Error
										? `Invalid access token: ${cause.message}`
										: "Invalid access token",
								status: 401,
							})
						: new NetworkError({ cause }),
				),
			),
			Effect.retry({
				while: (e) => e._tag === "NetworkError",
				schedule: Schedule.exponential("100 millis").pipe(
					Schedule.compose(Schedule.recurs(2)),
				),
			}),
		);

		const claims = yield* decodeWithSchema(
			WorkOSAccessTokenClaims,
			rawClaims,
			(message) =>
				new TokenValidationError({
					message: `Invalid access token claims: ${message}`,
					status: 401,
				}),
		);

		context.tokenValidationStatus = 200;
		context.tokenValid = true;
		context.userId = claims.sub;
		if (claims.org_id !== undefined) {
			context.organizationId = claims.org_id;
		}

		span.setAttribute("machine.validation_status", 200);
	});

	return effect.pipe(
		Effect.tap(() =>
			Effect.sync(() => {
				span.setStatus({ code: SpanStatusCode.OK });
			}),
		),
		Effect.tapError((error) =>
			Effect.sync(() => {
				if (error._tag === "TokenValidationError") {
					context.tokenValidationStatus = error.status ?? 401;
					context.tokenValid = false;
				}
				span.setStatus({ code: SpanStatusCode.ERROR, message: error._tag });
				span.recordException(new Error(error._tag));
			}),
		),
		Effect.ensuring(
			Effect.sync(() => {
				span.end();
			}),
		),
	);
}

function resolveBody(
	body: unknown,
	context: CanonicalContext,
): Effect.Effect<ResolvedBody, BodyParseError> {
	const span = tracer.startSpan("machine.resolve_body");
	span.setAttribute("machine.request_id", context.requestId);

	const effect = Effect.gen(function* () {
		const request = yield* decodeWithSchema(
			appRequestShape,
			body,
			(message) =>
				new BodyParseError({ message: `Invalid request body: ${message}` }),
		);

		const model = openaiCodex[request.model];
		if (!model) {
			yield* Effect.fail(
				new BodyParseError({ message: `Unknown model ID: ${request.model}` }),
			);
			return undefined as never;
		}

		context.modelId = request.model;
		context.upstreamModel = model.id;
		context.provider = request.provider;
		context.providerHost = new URL(model.baseUrl).host;
		context.stream = request.stream;

		span.setAttribute("machine.model_id", request.model);
		span.setAttribute("machine.provider", request.provider);
		span.setAttribute("machine.provider_host", context.providerHost);

		return {
			request,
			providerName: request.provider,
			upstreamUrl: `${model.baseUrl.toString().replace(/\/$/, "")}/codex/responses`,
			// Codex upstream is consumed as SSE even when the caller wants a batch result.
			// We always request a streamed upstream response and collect it internally
			// when `request.stream` is false.
			upstreamPayload: {
				...compileRequest(request),
				stream: true,
			},
		};
	});

	return effect.pipe(
		Effect.tap(() =>
			Effect.sync(() => {
				span.setStatus({ code: SpanStatusCode.OK });
			}),
		),
		Effect.tapError((error) =>
			Effect.sync(() => {
				span.setStatus({ code: SpanStatusCode.ERROR, message: error._tag });
				span.recordException(new Error(error._tag));
			}),
		),
		Effect.ensuring(
			Effect.sync(() => {
				span.end();
			}),
		),
	);
}

export function handleRequest(
	headers: BearerHeaders,
	body: unknown,
): Effect.Effect<Response, MachineError> {
	const context: CanonicalContext = {
		requestId: crypto.randomUUID(),
		startedAt: Date.now(),
		outcome: "success",
	};

	const requestSpan = tracer.startSpan("machine.handle_request");
	context.traceId = requestSpan.spanContext().traceId;
	requestSpan.setAttribute("machine.request_id", context.requestId);
	requestSpan.setAttribute("machine.trace_id", context.traceId);

	const effect = Effect.gen(function* () {
		yield* validateToken(headers, context);
		const resolved = yield* resolveBody(body, context);
		return yield* sendUpstream(resolved, context);
	});

	return effect.pipe(
		Effect.tap((response) =>
			Effect.sync(() => {
				context.outcome = "success";
				context.httpStatus = response.status;
				requestSpan.setAttribute("http.status_code", response.status);
				requestSpan.setStatus({ code: SpanStatusCode.OK });
			}),
		),
		Effect.tapError((error) =>
			Effect.sync(() => {
				context.outcome = "error";
				context.errorType = error._tag;
				context.errorMessage = messageFromError(error);
				context.httpStatus = statusFromError(error);

				requestSpan.setAttribute("http.status_code", context.httpStatus);
				requestSpan.setStatus({
					code:
						failureLevel(error._tag) === "error"
							? SpanStatusCode.ERROR
							: SpanStatusCode.UNSET,
					message: error._tag,
				});
				requestSpan.recordException(new Error(error._tag));
			}),
		),
		Effect.ensuring(
			Effect.sync(() => {
				emitCanonicalLog(context);
				requestSpan.end();
			}),
		),
	);
}

function sendUpstream(
	body: ResolvedBody,
	context: CanonicalContext,
): Effect.Effect<Response, NetworkError | UpstreamError | RateLimitError> {
	const span = tracer.startSpan("machine.send_upstream");
	span.setAttribute("machine.request_id", context.requestId);

	const effect = Effect.gen(function* () {
		const { providerName, request, upstreamPayload, upstreamUrl } = body;

		if (!context.userId) {
			yield* new UpstreamError({
				message: "Validated access token did not include a user ID",
			});
		}

		context.provider = providerName;
		context.providerHost = new URL(upstreamUrl).host;
		context.stream = request.stream;

		span.setAttribute("machine.provider", providerName);
		span.setAttribute("machine.provider_host", context.providerHost);
		span.setAttribute("machine.stream", request.stream);

		const res: AxiosResponse<UpstreamPayload> = yield* (() => {
			switch (providerName) {
				case "openai-codex":
					return Effect.gen(function* () {
						const credentialRequest = yield* decodeWithSchema(
							CredentialLookupRequest,
							{
								userId: context.userId,
								provider: providerName,
							},
							(message) =>
								new UpstreamError({
									message: `Invalid credential lookup request: ${message}`,
								}),
						);

						const credentials = yield* Effect.tryPromise({
							try: () =>
								axios.get(
									"https://cautious-platypus-49.convex.site/credentials",
									{
										params: {
											userId: credentialRequest.userId,
											provider: credentialRequest.provider,
										},
										validateStatus: () => true,
									},
								),
							catch: (cause) => new NetworkError({ cause }),
						});

						if (credentials.status < 200 || credentials.status >= 300) {
							return yield* Effect.fail(
								new UpstreamError({
									message: `Credential service request failed with status ${credentials.status}: ${stringifyUnknown(credentials.data)}`,
									status: credentials.status,
								}),
							);
						}

						const credential = yield* decodeWithSchema(
							CredentialLookupResponse,
							credentials.data,
							(message) =>
								new UpstreamError({
									message: `Invalid credential response: ${message}`,
								}),
						);

						if (credential === null) {
							return yield* Effect.fail(
								new UpstreamError({
									message: `Missing credentials for provider: ${providerName}`,
								}),
							);
						}

						const sendToUpstream = (token: string) =>
							Effect.tryPromise({
								try: () =>
									axios.post(upstreamUrl, upstreamPayload, {
										headers: {
											"Content-Type": "application/json",
											Authorization: `Bearer ${token}`,
											...(credential.provider_account_id
												? {
														"ChatGPT-Account-Id":
															credential.provider_account_id,
													}
												: {}),
										},
										responseType: "stream",
										validateStatus: () => true,
									}),
								catch: (cause) => new NetworkError({ cause }),
							});

						const initialResponse = yield* sendToUpstream(
							credential.accessToken,
						);
						if (
							initialResponse.status !== 401 &&
							initialResponse.status !== 403
						) {
							if (credential.refresh_token) {
								const sessionTokens: RotatedSessionTokens = {
									accessToken: credential.accessToken,
									refreshToken: credential.refresh_token,
								};

								return {
									...initialResponse,
									headers: {
										...initialResponse.headers,
										"x-machine-session-tokens": JSON.stringify(sessionTokens),
									},
								};
							}

							return initialResponse;
						}

						if (!credential.refresh_token) {
							return yield* Effect.fail(
								new UpstreamError({
									message:
										"Access token rejected and no refresh token is available. Reconnect OpenAI Codex.",
									status: initialResponse.status,
								}),
							);
						}

						const refreshResponse = yield* Effect.tryPromise({
							try: () =>
								axios.post(
									"https://auth.openai.com/oauth/token",
									{
										grant_type: "refresh_token",
										refresh_token: credential.refresh_token,
										client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
									},
									{
										headers: {
											"Content-Type": "application/json",
										},
										validateStatus: () => true,
									},
								),
							catch: (cause) => new NetworkError({ cause }),
						});

						if (refreshResponse.status < 200 || refreshResponse.status >= 300) {
							return yield* Effect.fail(
								new UpstreamError({
									message: `Refresh token request failed with status ${refreshResponse.status}: ${stringifyUnknown(refreshResponse.data)}`,
									status: refreshResponse.status,
								}),
							);
						}

						const refreshedTokenData = yield* decodeWithSchema(
							OpenAIRefreshTokenResponse,
							refreshResponse.data,
							(message) =>
								new UpstreamError({
									message: `Invalid refresh token response: ${message}`,
								}),
						);

						const retryResponse = yield* sendToUpstream(
							refreshedTokenData.access_token,
						);
						const sessionTokens: RotatedSessionTokens = {
							accessToken: refreshedTokenData.access_token,
							refreshToken:
								refreshedTokenData.refresh_token ?? credential.refresh_token,
						};

						return {
							...retryResponse,
							headers: {
								...retryResponse.headers,
								"x-machine-session-tokens": JSON.stringify(sessionTokens),
							},
						};
					});

				default:
					return Effect.fail(
						new UpstreamError({
							message: `Unsupported provider: ${providerName}`,
						}),
					);
			}
		})();

		context.upstreamStatus = res.status;
		span.setAttribute("machine.upstream_status", res.status);

		if (res.status === 429) {
			yield* new RateLimitError({ message: "Rate limited by provider" });
		}

		if (res.status < 200 || res.status >= 300) {
			const upstreamErrorBody = yield* Effect.tryPromise({
				try: () => readUpstreamErrorBody(res.data),
				catch: (cause) => new NetworkError({ cause }),
			}).pipe(Effect.orElseSucceed(() => stringifyUnknown(res.data)));

			yield* new UpstreamError({
				message: `Upstream request failed with status ${res.status}: ${upstreamErrorBody || stringifyUnknown(res.data)}`,
				status: res.status,
			});
		}

		const requestId = res.headers["x-request-id"] as string | undefined;
		const passthroughHeaders = new Headers(
			res.headers as Record<string, string>,
		);
		passthroughHeaders.set("x-accel-buffering", "no");
		passthroughHeaders.set("cache-control", "no-cache");
		if (requestId) {
			passthroughHeaders.set("x-request-id", requestId);
		}
		if (context.traceId) {
			passthroughHeaders.set("x-trace-id", context.traceId);
		}
		passthroughHeaders.set("x-machine-request-id", context.requestId);
		const sessionTokensHeader = res.headers["x-machine-session-tokens"];
		const sessionTokens =
			typeof sessionTokensHeader === "string"
				? (JSON.parse(sessionTokensHeader) as RotatedSessionTokens)
				: undefined;

		if (request.stream) {
			return createUnifiedStreamingResponse(res.data, passthroughHeaders, {
				runId: context.requestId,
				tools: request.tools,
				...(sessionTokens ? { sessionTokens } : {}),
			});
		}

		const finalResponse = yield* Effect.tryPromise({
			try: () => collectUnifiedResponse(res.data, sessionTokens),
			catch: (cause) =>
				new UpstreamError({
					message: `Failed to map upstream response: ${stringifyUnknown(cause)}`,
				}),
		});

		passthroughHeaders.set("content-type", "application/json; charset=utf-8");

		return Response.json(finalResponse, {
			status: res.status,
			headers: passthroughHeaders,
		});
	});

	return effect.pipe(
		Effect.tap(() =>
			Effect.sync(() => {
				span.setStatus({ code: SpanStatusCode.OK });
			}),
		),
		Effect.tapError((error) =>
			Effect.sync(() => {
				span.setStatus({ code: SpanStatusCode.ERROR, message: error._tag });
				span.recordException(new Error(error._tag));
			}),
		),
		Effect.ensuring(
			Effect.sync(() => {
				span.end();
			}),
		),
	);
}
