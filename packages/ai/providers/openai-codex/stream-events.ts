import type { ResponseStreamEvent } from "openai/resources/responses/responses.js";
import type {
	ApprovalRejectionMode,
	ApprovalRequest,
	ResponseFinishReason,
	ResponseToolCallPart,
	UnifiedStreamDoneReasonType,
	UnifiedStreamEventType,
} from "../../types.ts";
import type { Accumulator } from "./map-response.ts";
import { parseToolCallItem, toUnifiedSnapshot } from "./map-response.ts";

/**
 * This maps Codex `finishReason` into pi-mono `done` reasons (`toolUse` for tool-call stops).
 */
export function unifiedStreamDoneReason(
	finishReason: ResponseFinishReason,
): UnifiedStreamDoneReasonType {
	if (finishReason === "length") {
		return "length";
	}
	if (finishReason === "tool-call") {
		return "toolUse";
	}
	return "stop";
}

/**
 * This builds a lookup from tool name to approval settings using the request `tools` list (same shape as `appRequestShape.tools`).
 */
export function approvalToolConfigFromRequest(
	tools: unknown,
): Map<
	string,
	{ requiresApproval?: boolean; rejectionMode: ApprovalRejectionMode }
> {
	const map = new Map<
		string,
		{ requiresApproval?: boolean; rejectionMode: ApprovalRejectionMode }
	>();
	if (!Array.isArray(tools)) {
		return map;
	}
	for (const raw of tools) {
		if (!raw || typeof raw !== "object") {
			continue;
		}
		const tool = raw as {
			name?: unknown;
			requiresApproval?: unknown;
			rejectionMode?: unknown;
		};
		if (typeof tool.name !== "string") {
			continue;
		}
		const entry: {
			requiresApproval?: boolean;
			rejectionMode: ApprovalRejectionMode;
		} = {
			rejectionMode:
				tool.rejectionMode === "abort_run" ||
				tool.rejectionMode === "return_tool_error"
					? tool.rejectionMode
					: "return_tool_error",
		};
		if (tool.requiresApproval === true) {
			entry.requiresApproval = true;
		}
		map.set(tool.name, entry);
	}
	return map;
}

function newApprovalRequest(
	runId: string,
	tool: ResponseToolCallPart,
	rejectionMode: ApprovalRejectionMode,
): ApprovalRequest {
	return {
		id: globalThis.crypto.randomUUID(),
		runId,
		toolCallId: tool.id,
		toolName: tool.name,
		input: tool.arguments,
		status: "pending",
		rejectionMode,
	};
}

function toolCallById(
	next: Accumulator,
	itemId: string,
): ResponseToolCallPart | undefined {
	return next.toolCalls.find((part) => part.id === itemId);
}

function maybeApprovalEvent(
	next: Accumulator,
	runId: string,
	tool: ResponseToolCallPart,
	approvalByToolName: Map<
		string,
		{ requiresApproval?: boolean; rejectionMode: ApprovalRejectionMode }
	>,
): UnifiedStreamEventType | undefined {
	const cfg = approvalByToolName.get(tool.name);
	if (!cfg?.requiresApproval) {
		return undefined;
	}
	return {
		type: "approval_required",
		approval: newApprovalRequest(runId, tool, cfg.rejectionMode),
		partial: toUnifiedSnapshot(next),
	};
}

/**
 * This turns one Codex SSE event into zero or more pi-mono-shaped unified stream frames after the accumulator step.
 */
export function codexUnifiedStreamEvents(input: {
	event: ResponseStreamEvent;
	next: Accumulator;
	runId: string;
	approvalByToolName: Map<
		string,
		{ requiresApproval?: boolean; rejectionMode: ApprovalRejectionMode }
	>;
	toolCallStartSent: Set<string>;
	toolCallEndSent: Set<string>;
	textBlockStarted: Set<number>;
	reasoningSummaryStarted: Set<number>;
	reasoningTextStarted: Set<number>;
}): UnifiedStreamEventType[] {
	const {
		event,
		next,
		runId,
		approvalByToolName,
		toolCallStartSent,
		toolCallEndSent,
		textBlockStarted,
		reasoningSummaryStarted,
		reasoningTextStarted,
	} = input;
	const partial = toUnifiedSnapshot(next);
	const out: UnifiedStreamEventType[] = [];

	switch (event.type) {
		case "response.created": {
			out.push({ type: "start", partial });
			break;
		}
		case "response.output_text.delta": {
			const contentIndex =
				"content_index" in event &&
				typeof (event as { content_index?: unknown }).content_index === "number"
					? (event as { content_index: number }).content_index
					: 0;
			const delta =
				"delta" in event && typeof event.delta === "string" ? event.delta : "";
			if (!textBlockStarted.has(contentIndex)) {
				textBlockStarted.add(contentIndex);
				out.push({
					type: "text_start",
					contentIndex,
					partial,
				});
			}
			out.push({
				type: "text_delta",
				contentIndex,
				delta,
				partial,
			});
			break;
		}
		case "response.output_text.done": {
			const contentIndex =
				"output_index" in event &&
				typeof (event as { output_index?: unknown }).output_index === "number"
					? (event as { output_index: number }).output_index
					: 0;
			const content =
				"text" in event &&
				typeof (event as { text?: unknown }).text === "string"
					? (event as { text: string }).text
					: next.text;
			out.push({
				type: "text_end",
				contentIndex,
				content,
				partial,
			});
			break;
		}
		case "response.output_item.added": {
			const toolCall = parseToolCallItem(event.item);
			if (toolCall && !toolCallStartSent.has(toolCall.id)) {
				toolCallStartSent.add(toolCall.id);
				out.push({
					type: "toolcall_start",
					contentIndex: event.output_index,
					partial,
				});
			}
			break;
		}
		case "response.function_call_arguments.delta": {
			out.push({
				type: "toolcall_delta",
				contentIndex: event.output_index,
				delta: event.delta,
				partial,
			});
			break;
		}
		case "response.reasoning_summary_part.added": {
			if (!reasoningSummaryStarted.has(event.summary_index)) {
				reasoningSummaryStarted.add(event.summary_index);
				out.push({
					type: "thinking_start",
					contentIndex: event.summary_index,
					partial,
				});
			}
			break;
		}
		case "response.reasoning_summary_text.delta": {
			if (!reasoningSummaryStarted.has(event.summary_index)) {
				reasoningSummaryStarted.add(event.summary_index);
				out.push({
					type: "thinking_start",
					contentIndex: event.summary_index,
					partial,
				});
			}
			out.push({
				type: "thinking_delta",
				contentIndex: event.summary_index,
				delta: event.delta,
				partial,
			});
			break;
		}
		case "response.reasoning_summary_text.done": {
			out.push({
				type: "thinking_end",
				contentIndex: event.summary_index,
				content: event.text,
				partial,
			});
			break;
		}
		case "response.reasoning_text.delta": {
			if (!reasoningTextStarted.has(event.content_index)) {
				reasoningTextStarted.add(event.content_index);
				out.push({
					type: "thinking_start",
					contentIndex: event.content_index,
					partial,
				});
			}
			out.push({
				type: "thinking_delta",
				contentIndex: event.content_index,
				delta: event.delta,
				partial,
			});
			break;
		}
		case "response.reasoning_text.done": {
			out.push({
				type: "thinking_end",
				contentIndex: event.content_index,
				content: event.text,
				partial,
			});
			break;
		}
		case "response.function_call_arguments.done": {
			if (!toolCallEndSent.has(event.item_id)) {
				toolCallEndSent.add(event.item_id);
				const tool = toolCallById(next, event.item_id);
				if (tool) {
					out.push({
						type: "toolcall_end",
						contentIndex: event.output_index,
						toolCall: tool,
						partial,
					});
					const approval = maybeApprovalEvent(
						next,
						runId,
						tool,
						approvalByToolName,
					);
					if (approval) {
						out.push(approval);
					}
				}
			}
			break;
		}
		case "response.output_item.done": {
			const toolCall = parseToolCallItem(event.item);
			if (!toolCall || toolCallEndSent.has(toolCall.id)) {
				break;
			}
			toolCallEndSent.add(toolCall.id);
			const tool = toolCallById(next, toolCall.id) ?? toolCall;
			out.push({
				type: "toolcall_end",
				contentIndex: event.output_index,
				toolCall: tool,
				partial,
			});
			const approval = maybeApprovalEvent(
				next,
				runId,
				tool,
				approvalByToolName,
			);
			if (approval) {
				out.push(approval);
			}
			break;
		}
		case "response.completed": {
			out.push({
				type: "done",
				reason: unifiedStreamDoneReason(next.finishReason),
				response: toUnifiedSnapshot(next),
			});
			break;
		}
		default:
			break;
	}

	return out;
}
