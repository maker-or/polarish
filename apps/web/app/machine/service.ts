import {
  appRequestShape,
  compileRequest,
  openaiCodex,
  type AppRequestShapeType,
} from "@hax/ai";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import axios from "axios";
import type { AxiosResponse } from "axios";
import { Data, Effect, Either, ParseResult, Schedule, Schema } from "effect";
import {
  type BearerHeaders,
  CredentialLookupRequest,
  CredentialLookupResponse,
  OpenAIRefreshTokenResponse,
  TokenValidationResponse,
} from "./model";

class MissingAuthHeader extends Data.TaggedError(
  "MissingAuthHeader",
)<Record<string, never>> {}
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

function validateToken(
  header: BearerHeaders,
  context: CanonicalContext,
): Effect.Effect<void, MissingAuthHeader | NetworkError | TokenValidationError> {
  const span = tracer.startSpan("machine.validate_token");
  span.setAttribute("machine.request_id", context.requestId);

  const effect = Effect.gen(function* () {
    if (!header.authorization?.startsWith("Bearer ")) {
      yield* Effect.fail(new MissingAuthHeader({}));
      return undefined as never;
    }

    const token = header.authorization.replace("Bearer ", "").trim();
    span.setAttribute("machine.token_hash", hashString(token).toString());

    const res = yield* Effect.tryPromise({
      try: () =>
        axios.post(
          "https://cautious-platypus-49.convex.site/verify-api-key",
          { token },
          {
            headers: { "Content-Type": "application/json" },
            validateStatus: () => true,
          },
        ),
      catch: (cause) => new NetworkError({ cause }),
    }).pipe(
      Effect.retry({
        while: (e) => e._tag === "NetworkError",
        schedule: Schedule.exponential("100 millis").pipe(
          Schedule.compose(Schedule.recurs(2)),
        ),
      }),
    );

    const validationBody = yield* decodeWithSchema(
      TokenValidationResponse,
      res.data,
      (message) =>
        new TokenValidationError({
          message: `Invalid token validation response: ${message}`,
          status: res.status,
        }),
    );
    const isTokenValid = validationBody?.valid === true;

    context.tokenValidationStatus = res.status;
    context.tokenValid = isTokenValid;
    context.userId = validationBody?.userId ?? undefined;

    span.setAttribute("machine.validation_status", res.status);
    if (res.status < 200 || res.status >= 300 || !isTokenValid) {
      yield* new TokenValidationError({
        message: "Invalid API key",
        status: res.status,
      });
    }
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

function resolveBody(
  body: unknown,
  context: CanonicalContext,
): Effect.Effect<ResolvedBody, BodyParseError> {
  const span = tracer.startSpan("machine.resolve_body");
  span.setAttribute("machine.request_id", context.requestId);

  const effect = Effect.gen(function* () {
    const request = yield* decodeWithSchema(appRequestShape, body, (message) =>
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

    if (request.provider === "openai-codex" && request.stream === false) {
      yield* Effect.fail(
        new BodyParseError({
          message:
            "openai-codex requires stream: true (the upstream Codex Responses API rejects stream: false)",
        }),
      );
    }

    span.setAttribute("machine.model_id", request.model);
    span.setAttribute("machine.provider", request.provider);
    span.setAttribute("machine.provider_host", context.providerHost);

    return {
      request,
      providerName: request.provider,
      upstreamUrl: `${model.baseUrl.toString().replace(/\/$/, "")}/codex/responses`,
      upstreamPayload: compileRequest(request),
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
        message: "Validated API key did not include a user ID",
      });
    }

    context.provider = providerName;
    context.providerHost = new URL(upstreamUrl).host;
    context.stream = request.stream;

    span.setAttribute("machine.provider", providerName);
    span.setAttribute("machine.provider_host", context.providerHost);
    span.setAttribute("machine.stream", request.stream);

    type UpstreamPayload = ReadableStream | string | Uint8Array | object;
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
                axios.get("https://cautious-platypus-49.convex.site/credentials", {
                  params: {
                    userId: credentialRequest.userId,
                    provider: credentialRequest.provider,
                  },
                  validateStatus: () => true,
                }),
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
                    validateStatus: () => true,
                  }),
                catch: (cause) => new NetworkError({ cause }),
              });

            const initialResponse = yield* sendToUpstream(credential.accessToken);
            if (
              initialResponse.status !== 401 &&
              initialResponse.status !== 403
            ) {
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

            return yield* sendToUpstream(refreshedTokenData.access_token);
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
      yield* new UpstreamError({
        message: `Upstream request failed with status ${res.status}: ${stringifyUnknown(res.data)}`,
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

    return new Response(res.data as ReadableStream, {
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
