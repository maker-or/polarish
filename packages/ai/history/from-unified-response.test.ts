import { describe, expect, test } from "bun:test";
import type { UnifiedResponse } from "../types.ts";
import {
	appendAssistant,
	emptyUsage,
	finishReasonToStopReason,
	normalizeToolArgumentsForHistory,
	toAssistantMessage,
	toolExecutionToMessage,
} from "./from-unified-response.ts";

function baseResponse(
	overrides: Partial<UnifiedResponse> = {},
): UnifiedResponse {
	return {
		status: "completed",
		content: [],
		toolCalls: [],
		approvals: [],
		warnings: [],
		providerMetadata: { provider: "openai-codex" },
		...overrides,
	};
}

describe("toAssistantMessage", () => {
	test("maps text, reasoning, and tool-call parts in order", () => {
		const response = baseResponse({
			content: [
				{ type: "text", text: "Hello" },
				{ type: "reasoning", text: "plan" },
				{
					type: "tool-call",
					id: "fc_1",
					callId: "call_1",
					name: "search",
					arguments: { q: "x" },
				},
			],
			toolCalls: [
				{
					type: "tool-call",
					id: "fc_1",
					callId: "call_1",
					name: "search",
					arguments: { q: "x" },
				},
			],
			finishReason: "tool-call",
			usage: {
				input: 1,
				output: 2,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 3,
				cost: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0,
				},
			},
		});

		const assistant = toAssistantMessage(response, {
			timestamp: 99,
		});

		expect(assistant.role).toBe("assistant");
		expect(assistant.timestamp).toBe(99);
		expect(assistant.provider).toBe("openai-codex");
		expect(assistant.stopReason).toBe("toolUse");
		expect(assistant.usage.totalTokens).toBe(3);
		expect(assistant.content).toEqual([
			{ type: "text", text: "Hello" },
			{ type: "thinking", thinking: "plan" },
			{
				type: "toolcall",
				id: "fc_1",
				callId: "call_1",
				name: "search",
				arguments: { q: "x" },
			},
		]);
	});

	test("prepends response.text when content has no text block", () => {
		const response = baseResponse({
			text: "Visible",
			content: [
				{
					type: "tool-call",
					id: "fc_2",
					name: "noop",
					arguments: {},
				},
			],
			toolCalls: [
				{
					type: "tool-call",
					id: "fc_2",
					name: "noop",
					arguments: {},
				},
			],
		});

		const assistant = toAssistantMessage(response);
		expect(assistant.content[0]).toEqual({ type: "text", text: "Visible" });
	});

	test("appends tool calls that only exist on toolCalls", () => {
		const response = baseResponse({
			content: [{ type: "text", text: "ok" }],
			toolCalls: [
				{
					type: "tool-call",
					id: "fc_only",
					name: "extra",
					arguments: { a: 1 },
				},
			],
		});

		const assistant = toAssistantMessage(response);
		expect(assistant.content).toEqual([
			{ type: "text", text: "ok" },
			{
				type: "toolcall",
				id: "fc_only",
				name: "extra",
				arguments: { a: 1 },
			},
		]);
	});

	test("omits provider when metadata omits provider", () => {
		const response = {
			...baseResponse({
				content: [{ type: "text", text: "x" }],
			}),
			providerMetadata: {},
		} as UnifiedResponse;
		const assistant = toAssistantMessage(response);
		expect(assistant.provider).toBeUndefined();
	});

	test("includes errorMessage when present", () => {
		const response = baseResponse({
			content: [],
			errorMessage: "boom",
		});
		const assistant = toAssistantMessage(response);
		expect(assistant.errorMessage).toBe("boom");
	});
});

describe("finishReasonToStopReason", () => {
	test("maps known finish reasons", () => {
		expect(finishReasonToStopReason("length")).toBe("max_tokens");
		expect(finishReasonToStopReason("tool-call")).toBe("toolUse");
		expect(finishReasonToStopReason("abort")).toBe("aborted");
		expect(finishReasonToStopReason("error")).toBe("error");
		expect(finishReasonToStopReason("content-filter")).toBe("stop");
		expect(finishReasonToStopReason(undefined)).toBe("stop");
	});
});

describe("normalizeToolArgumentsForHistory", () => {
	test("keeps plain objects and drops non-objects", () => {
		expect(normalizeToolArgumentsForHistory({ a: 1 })).toEqual({ a: 1 });
		expect(normalizeToolArgumentsForHistory("string")).toEqual({});
		expect(normalizeToolArgumentsForHistory([1, 2])).toEqual({});
	});
});

describe("emptyUsage", () => {
	test("returns zeroed usage", () => {
		const u = emptyUsage();
		expect(u.totalTokens).toBe(0);
		expect(u.cost.total).toBe(0);
	});
});

describe("toolExecutionToMessage", () => {
	test("builds a tool message", () => {
		const m = toolExecutionToMessage({
			toolCallId: "call_1",
			toolName: "search",
			result: { hits: 1 },
			timestamp: 5,
			isError: true,
		});
		expect(m.role).toBe("tool");
		expect(m.toolCallId).toBe("call_1");
		expect(m.toolName).toBe("search");
		expect(m.isError).toBe(true);
		expect(m.timestamp).toBe(5);
		expect(m.content).toEqual([{ type: "text", text: '{"hits":1}' }]);
	});
});

describe("append helpers", () => {
	test("appendAssistant appends assistant turn", () => {
		const prior = [{ role: "user" as const, content: "hi", timestamp: 1 }];
		const next = appendAssistant(
			prior,
			baseResponse({ content: [{ type: "text", text: "yo" }] }),
		);
		expect(next).toHaveLength(2);
		expect(next[1]?.role).toBe("assistant");
	});
});
