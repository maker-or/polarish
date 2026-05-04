import type { appRequestShape } from "../request.ts";
import type { CreateClientOptions, UnifiedGenerateResult } from "../types.ts";
import { aiDebugLog } from "./debug.ts";
import { generate } from "./generate.ts";
import type { RunOptions, RunResult, RunStreamingResult } from "./run.ts";
import { run } from "./run.ts";

/** Options for Client.run() — transport fields are set by create(). */
export type ClientRunOptions = Omit<RunOptions, "endpoint" | "origin">;

/**
 * This is the AI client you get from `create()`.
 * `generate` sends a single HTTP request. `run` drives the full agent loop — tool execution,
 * message history, and re-calling generate() are all handled automatically.
 *
 * Use `run({ stream: true })` to get a streaming handle with events across all turns.
 * Use `run({ stream: false })` to get a simple resolved RunResult when the loop finishes.
 */
export type Client = {
	/** The resolved bridge endpoint URL. */
	readonly endpoint: string;
	/** The app origin(s) presented to the bridge. */
	readonly origin?: string | string[];
	/** Sends a single HTTP request to the bridge. */
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

/**
 * Ensures that a string ends with a trailing slash.
 * @param value - The string to check.
 * @returns The string with a trailing slash.
 */
function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

/**
 * Resolves the bridge endpoint URL from a base URL.
 * @param baseUrl - The base URL to resolve from.
 * @returns The full endpoint URL.
 */
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

/**
 * Creates a new AI client for interacting with the Polarish bridge.
 * @param options - Options for the client, including baseUrl and origin.
 * @returns A Client object with generate and run methods.
 */
export function create(options: CreateClientOptions): Client {
	const endpoint = resolveEndpoint(options.baseUrl);
	const origin = options.origin;

	return {
		endpoint,
		origin,

		async generate(request: appRequestShape): Promise<UnifiedGenerateResult> {
			return generate(request, { endpoint, ...(origin ? { origin } : {}) });
		},

		run(
			request: appRequestShape,
			runOptions?: ClientRunOptions,
		): Promise<RunStreamingResult | RunResult> {
			return run(request, {
				...runOptions,
				endpoint,
				...(origin ? { origin } : {}),
			});
		},
	} as Client;
}
