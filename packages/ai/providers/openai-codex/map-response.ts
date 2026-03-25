import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import type { Response } from "openai/resources/responses/responses";
import type {
	NormalizedToolCall,
	NormalizedToolResult,
	ProviderMetadata,
	ResponseContentPart,
	ResponseFinishReason,
	ResponseTextPart,
	UnifiedResponse,
	Usage,
} from "../../types";

export type Accumulator = {
	internal: {
		rawCompletedResponse?: unknown;
	};
	text: string;
	content: ResponseContentPart[];
	toolCalls: NormalizedToolCall[];
	toolResults: NormalizedToolResult[];
	usage?: Usage;
	finishReason: ResponseFinishReason;
	providerMetadata: ProviderMetadata;
	warnings: string[];
	toolArgumentsByItemId: Record<string, string>;
	completed: boolean;
};

function usagemap(u: NonNullable<Response["usage"]>): Usage {
	const input = u.input_tokens ?? 0;
	const output = u.output_tokens ?? 0;
	const total = u.total_tokens ?? input + output;
	const cached = u.input_tokens_details?.cached_tokens ?? 0;
	return {
		input,
		output,
		cacheRead: cached,
		cacheWrite: 0,
		totalTokens: total,
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			total: 0,
		},
	};
}

function finishReasonFromCompleted(response: Response): ResponseFinishReason {
	if (response.error) return "error";
	const incomplete = response.incomplete_details;
	if (incomplete && typeof incomplete === "object") {
		const reason = (incomplete as { reason?: string }).reason;
		if (reason === "max_output_tokens") return "length";
	}
	if (response.status === "incomplete") return "length";
	return "stop";
}

export function emptyAccumulator(): Accumulator {
	return {
		internal: {},
		text: "",
		content: [],
		toolCalls: [],
		toolResults: [],
		finishReason: "error",
		providerMetadata: { provider: "openai-codex" },
		warnings: [],
		toolArgumentsByItemId: {},
		completed: false,
	};
}

export function mapChunk(
	state: Accumulator,
	event: ResponseStreamEvent,
): Accumulator {
	switch (event.type) {
		case "response.created": {
			const r = event.response;
			return {
				...state,
				finishReason: "stop",
				providerMetadata: {
					...state.providerMetadata,
					provider: "openai-codex",
					responseId: r.id,
					model: r.model ?? undefined,
				},
			};
		}
		case "response.in_progress":
			return state;
		case "response.output_item.added": {
			const item = event.item;
			if (item.type === "message") {
				return {
					...state,
					providerMetadata: {
						...state.providerMetadata,
						messageId: item.id,
					},
				};
			}
			return state;
		}
		case "response.content_part.added":
			return state;
		case "response.output_text.delta":
			return { ...state, text: state.text + event.delta };
		case "response.output_text.done":
			return state;
		case "response.content_part.done":
			return state;
		case "response.output_item.done":
			return state;
		case "response.completed": {
			const r = event.response;
			return {
				...state,
				internal: { ...state.internal, rawCompletedResponse: event },
				...(r.usage !== undefined && r.usage !== null
					? { usage: usagemap(r.usage) }
					: {}),
				finishReason: finishReasonFromCompleted(r),
				completed: true,
				providerMetadata: {
					...state.providerMetadata,
					responseId: r.id,
					model: r.model ?? state.providerMetadata.model,
				},
			};
		}
		default:
			return state;
	}
}

export function toUnifiedSnapshot(acc: Accumulator): UnifiedResponse {
	const textParts: ResponseContentPart[] =
		acc.text.length > 0
			? [{ type: "text", text: acc.text } satisfies ResponseTextPart]
			: [];
	return {
		text: acc.text.length > 0 ? acc.text : undefined,
		content: textParts,
		toolCalls: acc.toolCalls,
		toolResults: acc.toolResults,
		usage: acc.usage,
		finishReason: acc.finishReason,
		providerMetadata: acc.providerMetadata,
		warnings: acc.warnings,
	};
}
