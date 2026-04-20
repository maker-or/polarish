import type { appRequestShape } from "../request.ts";
import type { CreateClientOptions, UnifiedGenerateResult } from "../types.ts";
import { aiDebugLog } from "./debug.ts";
import { generate } from "./generate.ts";
import { run } from "./run.ts";
import type { RunOptions, RunResult, RunStreamingResult } from "./run.ts";

/** Options for Client.run() — everything except endpoint, which is set by create(). */
export type ClientRunOptions = Omit<RunOptions, "endpoint">;

/**
 * This is the AI client you get from `create()`.
 * `generate` sends a single HTTP request. `run` drives the full agent loop — tool execution,
 * message history, and re-calling generate() are all handled automatically.
 *
 * Use `run({ stream: true })` to get a streaming handle with events across all turns.
 * Use `run({ stream: false })` to get a simple resolved RunResult when the loop finishes.
 */
export type Client = {
	generate(request: appRequestShape): Promise<UnifiedGenerateResult>;
	/** Streaming agent loop — returns an events iterable and final() across all turns. */
	run(
		request: appRequestShape & { stream: true },
		options?: ClientRunOptions,
	): Promise<RunStreamingResult>;
	/** Batch agent loop — resolves with the final RunResult when the loop finishes. */
	run(
		request: appRequestShape & { stream: false },
		options?: ClientRunOptions,
	): Promise<RunResult>;
	run(
		request: appRequestShape,
		options?: ClientRunOptions,
	): Promise<RunStreamingResult | RunResult>;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:4318";
const BRIDGE_ENDPOINT_PATH = "/v1/generate";

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function resolveEndpoint(baseUrl?: string): string {
	const resolvedBaseUrl = baseUrl?.trim() || DEFAULT_BASE_URL;
	const endpoint = new URL(
		BRIDGE_ENDPOINT_PATH,
		ensureTrailingSlash(resolvedBaseUrl),
	).toString();
	aiDebugLog("create", "resolved bridge endpoint", {
		baseUrl: resolvedBaseUrl,
		endpoint,
	});
	return endpoint;
}

export function create(options: CreateClientOptions): Client {
	const endpoint = resolveEndpoint(options.baseUrl);

	return {
		async generate(request: appRequestShape): Promise<UnifiedGenerateResult> {
			return generate(request, { endpoint });
		},

		run(
			request: appRequestShape,
			runOptions?: ClientRunOptions,
		): Promise<RunStreamingResult | RunResult> {
			return run(request, { ...runOptions, endpoint });
		},
	} as Client;
}
