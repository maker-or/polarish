import type { appRequestShape } from "../providers/openai-codex/types.ts";
import type { CreateClientOptions, UnifiedGenerateResult } from "../types.ts";
import { generate } from "./generate.ts";

/**
 * This is the AI client you get from `create()`.
 * `generate` expects the OpenAI Codex app request shape (including `model`), not the generic `requestShape` helper.
 */
export type Client = {
	generate(request: appRequestShape): Promise<UnifiedGenerateResult>;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:4318";
const BRIDGE_ENDPOINT_PATH = "/v1/generate";

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function resolveEndpoint(baseUrl?: string): string {
	const resolvedBaseUrl = baseUrl?.trim() || DEFAULT_BASE_URL;
	return new URL(
		BRIDGE_ENDPOINT_PATH,
		ensureTrailingSlash(resolvedBaseUrl),
	).toString();
}

export function create(options: CreateClientOptions): Client {
	const endpoint = resolveEndpoint(options.baseUrl);

	return {
		async generate(request: appRequestShape): Promise<UnifiedGenerateResult> {
			return generate(request, { endpoint });
		},
	};
}
