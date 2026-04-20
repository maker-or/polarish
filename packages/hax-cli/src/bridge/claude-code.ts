import { execFile, spawn } from "node:child_process";
import readline from "node:readline";
import { promisify } from "node:util";
import {
	type AppRequestShapeType,
	type ResponseContentPartType,
	type ResponseFinishReasonType,
	type UnifiedGenerateResultType,
	type UnifiedResponseStreamingResultType,
	type UnifiedStreamEventPayload,
	createUnifiedResponseStream,
	unifiedResponseForStreamError,
} from "./contracts.js";
import { BridgeError } from "./errors.js";
import {
	type AdapterAvailability,
	type ExecuteContext,
	buildTranscript,
	createBridgeRequestLogger,
	createEventQueue,
	getNumber,
	getString,
	isRecord,
	summarizeAppRequest,
} from "./shared.js";

const execFileAsync = promisify(execFile);

/**
 * This is one tool call block that we keep while Claude Code streams JSON lines.
 */
type ClaudeToolCallPart = Extract<
	ResponseContentPartType,
	{ type: "tool-call" }
>;

/**
 * This is one live content block in the Claude Code stream accumulator.
 */
type ClaudeContentBlock =
	| {
			kind: "text";
			text: string;
	  }
	| {
			kind: "thinking";
			text: string;
	  }
	| {
			kind: "toolcall";
			id: string;
			name: string;
			callId?: string;
			argumentsText: string;
	  };

/**
 * This is the mutable run state for one Claude Code bridge request.
 */
type ClaudeRunState = {
	blocks: Map<number, ClaudeContentBlock>;
	errorMessage?: string;
	finishReason?: ResponseFinishReasonType;
	runStatus: "in_progress" | "completed" | "failed" | "aborted";
	sessionId?: string;
	started: boolean;
	warnings: string[];
};

/**
 * This checks whether Claude Code is installed and logged in on the local machine.
 */
export async function checkClaudeCodeAvailability(): Promise<AdapterAvailability> {
	try {
		const version = await execFileAsync("claude", ["--version"]);
		try {
			const status = await execFileAsync("claude", ["auth", "status"]);
			const detail = [
				version.stdout,
				version.stderr,
				status.stdout,
				status.stderr,
			]
				.join("\n")
				.trim();
			return {
				installed: true,
				authenticated: true,
				...(detail ? { detail } : {}),
				version: version.stdout.trim() || version.stderr.trim() || undefined,
			};
		} catch (error) {
			const detail = toExecDetail(error);
			return {
				installed: true,
				authenticated: false,
				...(detail ? { detail } : {}),
				version: version.stdout.trim() || version.stderr.trim() || undefined,
			};
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("ENOENT")) {
			return {
				installed: false,
				authenticated: false,
				detail: message,
			};
		}
		return {
			installed: true,
			authenticated: false,
			detail: message,
		};
	}
}

/**
 * This executes one Claude Code run through `claude -p` and returns the unified result shape.
 */
export async function executeClaudeCode(
	request: AppRequestShapeType,
	context: ExecuteContext,
): Promise<UnifiedGenerateResultType> {
	const logger = createBridgeRequestLogger(context.requestId, "claude-code");
	logger.log("claude execution start", summarizeAppRequest(request));
	if (request.provider !== "anthropic-claude-code") {
		throw new BridgeError({
			status: 400,
			code: "unsupported_provider",
			message: "Claude Code adapter received a non-Claude request.",
			metadata: {
				provider: request.provider,
			},
		});
	}

	const availability = await checkClaudeCodeAvailability();
	logger.log("claude availability checked", availability);
	if (!availability.installed) {
		throw new BridgeError({
			status: 503,
			code: "claude_code_not_installed",
			message: "Claude Code is not installed on this machine.",
			detail: availability.detail,
			suggestedAction: "Install the Claude Code CLI and retry the request.",
			metadata: {
				provider: request.provider,
			},
		});
	}

	if (!availability.authenticated) {
		throw new BridgeError({
			status: 401,
			code: "claude_code_not_authenticated",
			message: "Claude Code is not authenticated on this machine.",
			detail: availability.detail,
			suggestedAction:
				"Run `claude auth login` on this machine and retry the request.",
			metadata: {
				provider: request.provider,
			},
		});
	}

	void context.transport;

	const stream = createUnifiedResponseStream();
	const queue = createEventQueue();
	const state = createRunState(request);
	const args = buildClaudeCodeArgs(request);
	const child = spawn("claude", args, {
		stdio: ["ignore", "pipe", "pipe"],
		shell: process.platform === "win32",
	});
	logger.log("spawned claude process", {
		args,
	});

	if (!child.stdout || !child.stderr) {
		throw new BridgeError({
			status: 500,
			code: "claude_code_start_failed",
			message:
				"Claude Code did not expose the stdio pipes the bridge expected.",
		});
	}

	let settled = false;
	let stderrText = "";
	const finishSuccess = () => {
		if (settled) {
			return;
		}
		settled = true;
		logger.log("claude run finished successfully", {
			finishReason: state.finishReason,
		});
		const response = toUnifiedResponse(request, state);
		stream.controller.complete(response);
		queue.push({
			type: "done",
			reason: toDoneReason(state.finishReason ?? "stop"),
			response,
		});
		queue.close();
	};

	const failRun = (error: unknown) => {
		if (settled) {
			return;
		}
		settled = true;
		logger.error("claude run failed", {
			error: error instanceof Error ? error.message : String(error),
			stderr: stderrText.trim(),
		});
		const bridgeError =
			error instanceof BridgeError
				? error
				: new BridgeError({
						status: 500,
						code: "claude_code_execution_failed",
						message: "Claude Code failed while processing the request.",
						detail:
							error instanceof Error
								? error.message
								: stderrText.trim() || String(error),
						metadata: {
							provider: request.provider,
						},
					});
		const unifiedError = unifiedResponseForStreamError(
			bridgeError.payload.error.message,
		);
		queue.push({
			type: "error",
			reason: state.runStatus === "aborted" ? "aborted" : "error",
			error: {
				...unifiedError,
				errorMessage:
					bridgeError.payload.error.detail ?? bridgeError.payload.error.message,
				warnings: state.warnings,
				providerMetadata: {
					provider: request.provider,
					...(state.sessionId ? { requestId: state.sessionId } : {}),
					model: request.model,
				},
			},
		});
		queue.close();
		stream.controller.error(bridgeError);
		if (!child.killed) {
			child.kill();
		}
	};

	if (context.signal) {
		context.signal.addEventListener(
			"abort",
			() => {
				if (settled) {
					return;
				}
				logger.log("abort signal received");
				state.runStatus = "aborted";
				state.finishReason = "abort";
				state.errorMessage = "The request was aborted.";
				failRun(
					new BridgeError({
						status: 499,
						code: "aborted",
						message: "The request was aborted.",
					}),
				);
			},
			{ once: true },
		);
	}

	const stdoutReader = readline.createInterface({ input: child.stdout });
	stdoutReader.on("line", (line) => {
		if (!line.trim()) {
			return;
		}
		logger.log("claude stdout line", {
			line,
		});
		try {
			const event = JSON.parse(line) as unknown;
			handleClaudeJsonLine(event, request, state, queue.push);
			if (isResultEvent(event)) {
				finishSuccess();
			}
		} catch (error) {
			failRun(error);
		}
	});

	child.stderr.on("data", (chunk) => {
		stderrText +=
			typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		logger.log("claude stderr", {
			text: stderrText.trim(),
		});
	});

	child.on("error", (error) => {
		logger.error("claude child process error", {
			error: error.message,
		});
		failRun(
			new BridgeError({
				status: 502,
				code: "claude_code_start_failed",
				message: "Claude Code could not be started by the bridge.",
				detail: error.message,
			}),
		);
	});

	child.on("close", (code) => {
		stdoutReader.close();
		logger.log("claude process closed", {
			exitCode: code,
		});
		if (settled) {
			return;
		}
		if (code === 0) {
			finishSuccess();
			return;
		}
		state.runStatus = state.runStatus === "aborted" ? "aborted" : "failed";
		state.finishReason = state.runStatus === "aborted" ? "abort" : "error";
		state.errorMessage =
			stderrText.trim() ||
			`Claude Code exited with status ${code ?? "unknown"}.`;
		failRun(
			new BridgeError({
				status: 502,
				code: "claude_code_execution_failed",
				message: "Claude Code did not complete the request successfully.",
				detail: state.errorMessage,
				metadata: {
					provider: request.provider,
					exitCode: code,
				},
			}),
		);
	});

	if (request.stream) {
		logger.log("returning streaming claude result");
		const result: UnifiedResponseStreamingResultType = {
			...stream.result,
			events: queue.events,
		};
		return result;
	}

	try {
		const response = await stream.result.final();
		logger.log("returning batch claude result", {
			finishReason: response.finishReason,
			toolCalls: response.toolCalls.length,
		});
		return {
			stream: false,
			response,
		};
	} catch (error) {
		throw error instanceof BridgeError
			? error
			: new BridgeError({
					status: 502,
					code: "claude_code_execution_failed",
					message: "Claude Code did not complete the request successfully.",
					detail: error instanceof Error ? error.message : String(error),
					metadata: {
						provider: request.provider,
					},
				});
	}
}

/**
 * This builds the Claude Code CLI argv list for one bridge request.
 */
function buildClaudeCodeArgs(request: AppRequestShapeType): string[] {
	const args = [
		"-p",
		buildTranscript(request),
		"--model",
		request.model,
		"--output-format",
		"stream-json",
		"--verbose",
		"--include-partial-messages",
		"--no-session-persistence",
		"--permission-mode",
		"bypassPermissions",
	];

	if (request.system.trim()) {
		args.push("--append-system-prompt", request.system.trim());
	}

	return args;
}

/**
 * This creates the initial accumulator state and warnings for Claude Code runs.
 */
function createRunState(request: AppRequestShapeType): ClaudeRunState {
	const warnings: string[] = [
		"Claude Code bridge v1 runs in `bypassPermissions` mode because non-interactive approval plumbing is not wired yet.",
	];

	if (request.mcpServers && Object.keys(request.mcpServers).length > 0) {
		warnings.push(
			"Bridge-mediated `mcpServers` is implemented for openai-codex only; configure MCP in Claude Code separately or use the Codex provider.",
		);
	}

	if (request.messages.length > 1) {
		warnings.push(
			"Claude Code bridge v1 flattened message history into a single prompt transcript.",
		);
	}

	if (request.messages.some(messageHasAttachment)) {
		warnings.push(
			"Claude Code bridge v1 flattens attachments into transcript placeholders instead of forwarding binary content.",
		);
	}

	return {
		blocks: new Map(),
		runStatus: "in_progress",
		started: false,
		warnings,
	};
}

/**
 * This checks whether one history message contains any attachment blocks.
 */
function messageHasAttachment(
	message: AppRequestShapeType["messages"][number],
): boolean {
	return (
		typeof message.content !== "string" &&
		message.content.some((part) => part.type === "attachment")
	);
}

/**
 * This handles one parsed Claude Code JSON line and emits unified stream events.
 */
function handleClaudeJsonLine(
	line: unknown,
	request: AppRequestShapeType,
	state: ClaudeRunState,
	push: (event: UnifiedStreamEventPayload) => void,
): void {
	if (!isRecord(line)) {
		return;
	}

	const lineType = getString(line, "type");
	if (lineType === "system") {
		handleSystemLine(line, state, push);
		return;
	}

	if (lineType === "stream_event") {
		handleStreamEventLine(line, state, push);
		return;
	}

	if (lineType === "result") {
		state.runStatus = "completed";
		state.finishReason = "stop";
		state.sessionId = getString(line, "session_id") ?? state.sessionId;
		const resultText = getString(line, "result");
		if (resultText && getFinalText(state).length === 0) {
			state.blocks.set(0, { kind: "text", text: resultText });
		}
		return;
	}

	if (lineType === "assistant") {
		state.sessionId = getString(line, "session_id") ?? state.sessionId;
		if (getFinalText(state).length === 0) {
			const message = getString(line, "message");
			if (message) {
				state.blocks.set(0, { kind: "text", text: message });
			}
		}
		ensureStarted(state, push);
		return;
	}

	if (lineType === "error") {
		state.runStatus = "failed";
		state.finishReason = "error";
		state.errorMessage =
			getString(line, "message") ??
			getString(line, "error") ??
			"Claude Code run failed.";
		throw new BridgeError({
			status: 502,
			code: "claude_code_execution_failed",
			message: "Claude Code reported a runtime error.",
			detail: state.errorMessage,
			metadata: {
				provider: request.provider,
			},
		});
	}
}

/**
 * This handles one top-level `system` JSON line from Claude Code.
 */
function handleSystemLine(
	line: Record<string, unknown>,
	state: ClaudeRunState,
	push: (event: UnifiedStreamEventPayload) => void,
): void {
	state.sessionId = getString(line, "session_id") ?? state.sessionId;
	if (getString(line, "subtype") === "init") {
		ensureStarted(state, push);
	}
}

/**
 * This handles one nested Claude Code `stream_event` line.
 */
function handleStreamEventLine(
	line: Record<string, unknown>,
	state: ClaudeRunState,
	push: (event: UnifiedStreamEventPayload) => void,
): void {
	const event = isRecord(line.event) ? line.event : undefined;
	if (!event) {
		return;
	}

	ensureStarted(state, push);

	const eventType = getString(event, "type");
	switch (eventType) {
		case "message_start":
			return;
		case "content_block_start":
			handleContentBlockStart(event, state, push);
			return;
		case "content_block_delta":
			handleContentBlockDelta(event, state, push);
			return;
		case "content_block_stop":
			handleContentBlockStop(event, state, push);
			return;
		case "message_delta": {
			const delta = isRecord(event.delta) ? event.delta : undefined;
			const stopReason = delta ? getString(delta, "stop_reason") : undefined;
			if (stopReason === "max_tokens") {
				state.finishReason = "length";
			}
			return;
		}
		case "message_stop":
			return;
		default:
			return;
	}
}

/**
 * This handles one Claude `content_block_start` event.
 */
function handleContentBlockStart(
	event: Record<string, unknown>,
	state: ClaudeRunState,
	push: (event: UnifiedStreamEventPayload) => void,
): void {
	const contentIndex = getContentIndex(event);
	const block = isRecord(event.content_block) ? event.content_block : undefined;
	if (!block) {
		return;
	}

	const blockType = getString(block, "type");
	if (blockType === "text") {
		state.blocks.set(contentIndex, { kind: "text", text: "" });
		push({
			type: "text_start",
			contentIndex,
			partial: toUnifiedPartial(state),
		});
		return;
	}

	if (blockType === "thinking" || blockType === "redacted_thinking") {
		state.blocks.set(contentIndex, { kind: "thinking", text: "" });
		push({
			type: "thinking_start",
			contentIndex,
			partial: toUnifiedPartial(state),
		});
		return;
	}

	if (blockType === "tool_use") {
		const toolCall: ClaudeContentBlock = {
			kind: "toolcall",
			id: getString(block, "id") ?? `tool_${contentIndex}`,
			name: getString(block, "name") ?? "tool",
			...(getString(block, "id") ? { callId: getString(block, "id") } : {}),
			argumentsText: block.input ? JSON.stringify(block.input) : "",
		};
		state.blocks.set(contentIndex, toolCall);
		push({
			type: "toolcall_start",
			contentIndex,
			partial: toUnifiedPartial(state),
		});
	}
}

/**
 * This handles one Claude `content_block_delta` event.
 */
function handleContentBlockDelta(
	event: Record<string, unknown>,
	state: ClaudeRunState,
	push: (event: UnifiedStreamEventPayload) => void,
): void {
	const contentIndex = getContentIndex(event);
	const delta = isRecord(event.delta) ? event.delta : undefined;
	if (!delta) {
		return;
	}

	const deltaType = getString(delta, "type");
	if (deltaType === "text_delta") {
		const text = getString(delta, "text") ?? "";
		const current = state.blocks.get(contentIndex);
		if (!current || current.kind !== "text") {
			state.blocks.set(contentIndex, { kind: "text", text: text });
			push({
				type: "text_start",
				contentIndex,
				partial: toUnifiedPartial(state),
			});
		} else {
			current.text += text;
		}
		push({
			type: "text_delta",
			contentIndex,
			delta: text,
			partial: toUnifiedPartial(state),
		});
		return;
	}

	if (deltaType === "thinking_delta" || deltaType === "signature_delta") {
		const text =
			getString(delta, "thinking") ??
			getString(delta, "text") ??
			getString(delta, "signature") ??
			"";
		const current = state.blocks.get(contentIndex);
		if (!current || current.kind !== "thinking") {
			state.blocks.set(contentIndex, { kind: "thinking", text: text });
			push({
				type: "thinking_start",
				contentIndex,
				partial: toUnifiedPartial(state),
			});
		} else {
			current.text += text;
		}
		if (text.length > 0) {
			push({
				type: "thinking_delta",
				contentIndex,
				delta: text,
				partial: toUnifiedPartial(state),
			});
		}
		return;
	}

	if (deltaType === "input_json_delta") {
		const text =
			getString(delta, "partial_json") ?? getString(delta, "partialJson") ?? "";
		const current = state.blocks.get(contentIndex);
		if (!current || current.kind !== "toolcall") {
			state.blocks.set(contentIndex, {
				kind: "toolcall",
				id: `tool_${contentIndex}`,
				name: "tool",
				callId: `tool_${contentIndex}`,
				argumentsText: text,
			});
			push({
				type: "toolcall_start",
				contentIndex,
				partial: toUnifiedPartial(state),
			});
		} else {
			current.argumentsText += text;
		}
		push({
			type: "toolcall_delta",
			contentIndex,
			delta: text,
			partial: toUnifiedPartial(state),
		});
	}
}

/**
 * This handles one Claude `content_block_stop` event.
 */
function handleContentBlockStop(
	event: Record<string, unknown>,
	state: ClaudeRunState,
	push: (event: UnifiedStreamEventPayload) => void,
): void {
	const contentIndex = getContentIndex(event);
	const current = state.blocks.get(contentIndex);
	if (!current) {
		return;
	}

	if (current.kind === "text") {
		push({
			type: "text_end",
			contentIndex,
			content: current.text,
			partial: toUnifiedPartial(state),
		});
		return;
	}

	if (current.kind === "thinking") {
		push({
			type: "thinking_end",
			contentIndex,
			content: current.text,
			partial: toUnifiedPartial(state),
		});
		return;
	}

	push({
		type: "toolcall_end",
		contentIndex,
		toolCall: toToolCallPart(current),
		partial: toUnifiedPartial(state),
	});
}

/**
 * This derives the content index for one Claude content block event.
 */
function getContentIndex(event: Record<string, unknown>): number {
	return (
		getNumber(event, "index") ??
		getNumber(event, "content_block_index") ??
		getNumber(event, "contentIndex") ??
		0
	);
}

/**
 * This emits the shared `start` frame once per Claude run.
 */
function ensureStarted(
	state: ClaudeRunState,
	push: (event: UnifiedStreamEventPayload) => void,
): void {
	if (state.started) {
		return;
	}
	state.started = true;
	push(buildStartEvent(state));
}

/**
 * This builds the unified `start` event for one Claude run.
 */
function buildStartEvent(state: ClaudeRunState) {
	return {
		type: "start" as const,
		partial: toUnifiedPartial(state),
	};
}

/**
 * This turns the mutable Claude state into an in-progress unified response snapshot.
 */
function toUnifiedPartial(state: ClaudeRunState) {
	return {
		status: "in_progress" as const,
		...(getFinalText(state) ? { text: getFinalText(state) } : {}),
		content: buildUnifiedContent(state),
		toolCalls: buildToolCalls(state),
		approvals: [],
		warnings: state.warnings,
	};
}

/**
 * This turns the mutable Claude state into the final unified response payload.
 */
function toUnifiedResponse(
	request: AppRequestShapeType,
	state: ClaudeRunState,
) {
	return {
		status: state.runStatus,
		...(getFinalText(state) ? { text: getFinalText(state) } : {}),
		content: buildUnifiedContent(state),
		toolCalls: buildToolCalls(state),
		approvals: [],
		finishReason: state.finishReason,
		providerMetadata: {
			provider: request.provider,
			...(state.sessionId ? { requestId: state.sessionId } : {}),
			model: request.model,
		},
		warnings: state.warnings,
		...(state.errorMessage ? { errorMessage: state.errorMessage } : {}),
	};
}

/**
 * This builds the ordered unified response content list from Claude blocks.
 */
function buildUnifiedContent(state: ClaudeRunState): ResponseContentPartType[] {
	return [...state.blocks.entries()]
		.sort(([left], [right]) => left - right)
		.map(([, block]) => {
			if (block.kind === "text") {
				return {
					type: "text",
					text: block.text,
				} satisfies ResponseContentPartType;
			}
			if (block.kind === "thinking") {
				return {
					type: "reasoning",
					text: block.text,
				} satisfies ResponseContentPartType;
			}
			return toToolCallPart(block);
		});
}

/**
 * This builds the unified tool call list from Claude tool-use blocks.
 */
function buildToolCalls(state: ClaudeRunState): ClaudeToolCallPart[] {
	return [...state.blocks.values()]
		.filter(
			(block): block is Extract<ClaudeContentBlock, { kind: "toolcall" }> =>
				block.kind === "toolcall",
		)
		.map(toToolCallPart);
}

/**
 * This turns one live Claude tool block into the unified tool-call part.
 */
function toToolCallPart(
	block: Extract<ClaudeContentBlock, { kind: "toolcall" }>,
): ClaudeToolCallPart {
	return {
		type: "tool-call",
		id: block.id,
		name: block.name,
		arguments: parseToolArguments(block.argumentsText),
		...(block.callId ? { callId: block.callId } : {}),
	};
}

/**
 * This parses one tool argument JSON string, falling back to the raw string on parse errors.
 */
function parseToolArguments(argumentsText: string): unknown {
	if (argumentsText.length === 0) {
		return {};
	}
	try {
		return JSON.parse(argumentsText);
	} catch {
		return argumentsText;
	}
}

/**
 * This derives the text shortcut field from Claude text blocks in content order.
 */
function getFinalText(state: ClaudeRunState): string {
	return [...state.blocks.entries()]
		.sort(([left], [right]) => left - right)
		.map(([, block]) => (block.kind === "text" ? block.text : ""))
		.join("");
}

/**
 * This maps the unified finish reason to the terminal stream reason.
 */
function toDoneReason(finishReason: ResponseFinishReasonType) {
	if (finishReason === "length") {
		return "length" as const;
	}
	if (finishReason === "tool-call") {
		return "toolUse" as const;
	}
	return "stop" as const;
}

/**
 * This checks whether one parsed Claude line is the terminal result event.
 */
function isResultEvent(line: unknown): boolean {
	return isRecord(line) && getString(line, "type") === "result";
}

/**
 * This extracts stdout and stderr text from one failed `execFile` call.
 */
function toExecDetail(error: unknown): string | undefined {
	if (!error || typeof error !== "object") {
		return error instanceof Error ? error.message : String(error);
	}

	const detail = [
		getString(error as Record<string, unknown>, "stdout"),
		getString(error as Record<string, unknown>, "stderr"),
	]
		.filter((value): value is string => Boolean(value?.trim()))
		.join("\n")
		.trim();

	return detail || (error instanceof Error ? error.message : String(error));
}
