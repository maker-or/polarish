import type { appRequestShape } from "../providers/openai-codex/types.ts";
import type {
	UnifiedGenerateResult,
	UnifiedResponse,
	UnifiedResponseBatchResult,
	UnifiedResponseStreamingResult,
} from "../types.ts";
import { consumeUnifiedStream } from "./consume-unified-stream.ts";

type GenerateOptions = {
	endpoint: string;
	headers?: Record<string, string>;
};

/**
 * This sends a unified chat request to your local bridge endpoint.
 * The request must match `appRequestShape` (OpenAI Codex today): include `provider: "openai-codex"` and a `model` from the Codex model list.
 */
export function generate(
	request: appRequestShape & { stream: true },
	options: GenerateOptions,
): Promise<UnifiedResponseStreamingResult>;
export function generate(
	request: appRequestShape & { stream: false },
	options: GenerateOptions,
): Promise<UnifiedResponseBatchResult>;
export function generate(
	request: appRequestShape,
	options: GenerateOptions,
): Promise<UnifiedGenerateResult>;
export async function generate(
	request: appRequestShape,
	options: GenerateOptions,
): Promise<UnifiedGenerateResult> {
	if (typeof globalThis.fetch !== "function") {
		throw new Error("Fetch implementation is required");
	}

	const { signal, ...serializableRequest } = request;
	const headers = new Headers(options.headers);
	headers.set("content-type", "application/json");

	const response = await globalThis.fetch(options.endpoint, {
		method: "POST",
		headers,
		body: JSON.stringify(serializableRequest),
		...(signal ? { signal } : {}),
	});

	if (request.stream) {
		return consumeUnifiedStream(response);
	}

	if (!response.ok) {
		throw new Error(
			`Request failed with status ${response.status}: ${await response.text()}`,
		);
	}

	const finalResponse = (await response.json()) as UnifiedResponse;
	return {
		stream: false,
		response: finalResponse,
	};
}
