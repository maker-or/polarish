import type { appRequestShape } from "../request.ts";
import type {
	UnifiedGenerateResult,
	UnifiedResponse,
	UnifiedResponseBatchResult,
	UnifiedResponseStreamingResult,
} from "../types.ts";
import {
	assertCodexBridgeRequestHasToolExecutionIfNeeded,
	attachCodexToolHostCleanupToStream,
	startCodexToolCallbackIfNeeded,
} from "./codex-tool-callback-request.ts";
import { consumeUnifiedStream } from "./consume-unified-stream.ts";
import { aiDebugLog } from "./debug.ts";
import { buildBridgeHeaders } from "./headers.ts";

type GenerateOptions = {
	endpoint: string;
	origin?: string;
	headers?: Record<string, string>;
};

/**
 * This sends a unified chat request to your local bridge endpoint.
 * The request must match one of the supported provider request shapes and include
 * the right `provider` and `model` pair for that provider.
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

	let host: Awaited<ReturnType<typeof startCodexToolCallbackIfNeeded>>["host"];
	let streamHostCleanupAttached = false;

	try {
		aiDebugLog("generate", "start request", {
			provider: request.provider,
			stream: request.stream,
			toolNames: request.tools?.map((tool) => tool.name) ?? [],
		});
		const started = await startCodexToolCallbackIfNeeded(request);
		host = started.host;
		const bridgedRequest = started.request;
		assertCodexBridgeRequestHasToolExecutionIfNeeded(bridgedRequest);
		aiDebugLog("generate", "bridge request ready", {
			provider: bridgedRequest.provider,
			toolExecution: "toolExecution" in bridgedRequest,
			hasTools:
				Array.isArray(bridgedRequest.tools) && bridgedRequest.tools.length > 0,
		});

		const { signal, ...serializableRequest } = bridgedRequest;
		const headers = buildBridgeHeaders(options.origin, options.headers);
		aiDebugLog("generate", "posting to bridge", {
			endpoint: options.endpoint,
		});

		const response = await globalThis.fetch(options.endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify(serializableRequest),
			...(signal ? { signal } : {}),
		});
		aiDebugLog("generate", "bridge response received", {
			ok: response.ok,
			status: response.status,
			stream: request.stream,
		});

		if (request.stream) {
			const streaming = consumeUnifiedStream(response);
			aiDebugLog("generate", "streaming response started", {
				hasToolCallbackHost: host !== undefined,
			});
			if (host) {
				streamHostCleanupAttached = true;
				return attachCodexToolHostCleanupToStream(streaming, () => {
					aiDebugLog("generate", "dispose tool callback host after stream");
					host?.dispose();
				});
			}
			return streaming;
		}

		if (!response.ok) {
			const errorBody = await response.text();
			aiDebugLog("generate", "bridge request failed", {
				status: response.status,
				body: errorBody,
			});
			throw new Error(
				`Request failed with status ${response.status}: ${errorBody}`,
			);
		}

		const finalResponse = (await response.json()) as UnifiedResponse;
		aiDebugLog("generate", "batch response parsed", {
			status: finalResponse.status,
			finishReason: finalResponse.finishReason,
			toolCalls: finalResponse.toolCalls.length,
		});
		return {
			stream: false,
			response: finalResponse,
		};
	} finally {
		if (host && !streamHostCleanupAttached) {
			host.dispose();
		}
	}
}
