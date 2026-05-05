import { execFile, spawn } from "node:child_process";
import readline from "node:readline";
import { promisify } from "node:util";
import { DEFAULT_BRIDGE_CONFIG } from "../lib/bridge-config.js";
import {
	type AppRequestShapeType,
	type ResponseContentPartType,
	type ResponseFinishReasonType,
	type ToolExecutionCallbackConfigType,
	type UnifiedGenerateResultType,
	type UnifiedResponseStreamingResultType,
	createUnifiedResponseStream,
	unifiedResponseForStreamError,
} from "./contracts.js";
import { BridgeError } from "./errors.js";
import { resolveCodexExecutable } from "./executable-paths.js";
import {
	type CodexDynamicToolSpec,
	McpBridgeRegistry,
} from "./mcp/registry.js";
import type { CodexDynamicToolCallContentItem } from "./mcp/stdio-client.js";
import {
	type AdapterAvailability,
	type BridgeRequestLogger,
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

type JsonRpcRequestMessage = {
	id: number;
	method: string;
	params?: unknown;
};

type JsonRpcResponseMessage = {
	id: number;
	result?: unknown;
	error?: {
		code?: number;
		message?: string;
	};
};

type JsonRpcNotificationMessage = {
	method: string;
	params?: unknown;
};

type ToolCallContentPart = Extract<
	ResponseContentPartType,
	{ type: "tool-call" }
>;

type RunState = {
	autoInteractiveNoticeSent: boolean;
	dynamicToolBlockByItemId: Map<string, { contentIndex: number; tool: string }>;
	errorMessage?: string;
	finishReason?: ResponseFinishReasonType;
	reasoningStarted: Set<number>;
	reasoningText: Map<number, string>;
	runStatus: "in_progress" | "completed" | "failed" | "aborted";
	text: string;
	textBlockStarted: boolean;
	toolCallContentIndex: number;
	toolCallParts: ToolCallContentPart[];
	toolCalls: ToolCallContentPart[];
	turnId?: string;
	warnings: string[];
};

type CodexInputItem =
	| {
			type: "text";
			text: string;
	  }
	| {
			type: "image";
			url: string;
	  };

/**
 * This checks whether Codex is installed and logged in on the local machine.
 * Pass the resolved executable path from bridge requests; omit argument only for diagnostics (uses bridge.json / env / PATH defaults).
 */
export async function checkCodexAvailability(
	codexExecutable: string = resolveCodexExecutable(DEFAULT_BRIDGE_CONFIG),
): Promise<AdapterAvailability> {
	try {
		const version = await execFileAsync(codexExecutable, ["--version"]);
		const status = await execFileAsync(codexExecutable, ["login", "status"]);
		const detail = [
			version.stdout,
			version.stderr,
			status.stdout,
			status.stderr,
		]
			.join("\n")
			.trim();
		const combinedStatus = `${status.stdout}\n${status.stderr}`.toLowerCase();
		const authenticated = !combinedStatus.includes("not logged in");
		return {
			installed: true,
			authenticated,
			...(detail ? { detail } : {}),
			version: version.stdout.trim() || version.stderr.trim() || undefined,
		};
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
 * This executes one Codex run through `codex app-server` and returns the unified result shape.
 */
export async function executeCodex(
	request: AppRequestShapeType,
	context: ExecuteContext,
): Promise<UnifiedGenerateResultType> {
	const { signal } = context;
	const logger = createBridgeRequestLogger(context.requestId, "codex");
	logger.log("codex execution start", summarizeAppRequest(request));

	const codexExecutable = context.codexExecutable;
	const availability = await checkCodexAvailability(codexExecutable);
	logger.log("codex availability checked", {
		...availability,
		codexExecutable,
	});
	if (!availability.installed) {
		const isENOENT =
			availability.detail?.includes("ENOENT") === true ||
			availability.detail?.includes("spawn ") === true;
		throw new BridgeError({
			status: 503,
			code: "codex_not_installed",
			message: "Codex is not installed on this machine.",
			detail: availability.detail,
			suggestedAction: isENOENT
				? "Install the Codex CLI, or set POLARISH_CODEX_PATH / runtime.codexPath in bridge.json to the full path to the codex binary (needed when the bridge runs with a minimal PATH, e.g. launchd/systemd)."
				: "Install the Codex CLI and retry the request.",
			metadata: {
				provider: request.provider,
			},
		});
	}

	if (!availability.authenticated) {
		throw new BridgeError({
			status: 401,
			code: "codex_not_authenticated",
			message: "Codex is not authenticated on this machine.",
			detail: availability.detail,
			suggestedAction:
				"Run `codex login` on this machine and retry the request.",
			metadata: {
				provider: request.provider,
			},
		});
	}

	const stream = createUnifiedResponseStream();
	const state = createRunState(request);
	let mcpRegistry: McpBridgeRegistry | null = null;
	if (request.mcpServers && Object.keys(request.mcpServers).length > 0) {
		logger.log("creating mcp registry", {
			serverAliases: Object.keys(request.mcpServers),
		});
		mcpRegistry = await McpBridgeRegistry.create(
			request.mcpServers,
			logger.scope("mcp"),
		);
		state.warnings.push(
			`Bridge-mediated MCP: ${Object.keys(request.mcpServers).length} server(s), ${mcpRegistry.dynamicTools.length} tool(s) registered as Codex experimental dynamicTools.`,
		);
		logger.log("mcp registry ready", {
			dynamicToolNames: mcpRegistry.dynamicTools.map((tool) => tool.name),
		});
	}

	const queue = createEventQueue();
	const child = spawn(codexExecutable, ["app-server"], {
		stdio: ["pipe", "pipe", "pipe"],
		shell: process.platform === "win32",
	});
	logger.log("spawned codex app-server");
	const connection = createJsonRpcConnection(
		child,
		queue.pushError,
		logger.scope("jsonrpc"),
	);
	const baseCleanup = createCleanup(
		child,
		connection,
		queue.close,
		stream.controller.error,
	);
	const cleanup = (cause?: unknown) => {
		logger.log("cleanup start", {
			hasCause: cause !== undefined,
		});
		mcpRegistry?.dispose();
		mcpRegistry = null;
		baseCleanup(cause);
		logger.log("cleanup done");
	};

	const failRun = (error: unknown) => {
		logger.error("codex run failed", {
			error: error instanceof Error ? error.message : String(error),
			runStatus: state.runStatus,
			finishReason: state.finishReason,
		});
		const bridgeError =
			error instanceof BridgeError
				? error
				: new BridgeError({
						status: 500,
						code: "codex_execution_failed",
						message: "Codex failed while processing the request.",
						detail: error instanceof Error ? error.message : String(error),
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
			},
		});
		cleanup(bridgeError);
	};

	if (signal) {
		signal.addEventListener(
			"abort",
			() => {
				if (state.runStatus !== "in_progress") {
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

	connection.onNotification((notification) => {
		logger.log("jsonrpc notification", {
			method: notification.method,
		});
		handleNotification(notification, state, queue);
		if (notification.method === "turn/completed") {
			logger.log("turn completed notification received", {
				finishReason: state.finishReason,
				toolCalls: state.toolCalls.length,
			});
			stream.controller.complete(toUnifiedResponse(request, state));
			queue.push({
				type: "done",
				reason: toDoneReason(state.finishReason ?? "stop"),
				response: toUnifiedResponse(request, state),
			});
			cleanup();
		}
	});

	connection.onServerRequest(async (message) => {
		logger.log("jsonrpc server request", {
			id: message.id,
			method: message.method,
		});
		if (message.method === "item/tool/call" && isRecord(message.params)) {
			const tool =
				typeof message.params.tool === "string" ? message.params.tool : "";
			const args = message.params.arguments;
			logger.log("tool call request received", {
				tool,
				hasArgs: args !== undefined,
				usesMcp: tool.startsWith("mcp__"),
				hasToolExecution: request.toolExecution !== undefined,
			});

			if (tool.startsWith("mcp__")) {
				if (!mcpRegistry) {
					logger.error("mcp tool requested without registry", {
						tool,
					});
					await connection.respondWithResult(message.id, {
						contentItems: [
							{
								type: "inputText",
								text: "Codex requested an MCP tool but this run has no `mcpServers` registry.",
							},
						],
						success: false,
					});
					return;
				}
				const result = await mcpRegistry.executeToolCall(tool, args);
				logger.log("mcp tool call completed", {
					tool,
					success: result.success,
					contentItems: result.contentItems.length,
				});
				await connection.respondWithResult(message.id, result);
				return;
			}

			if (request.toolExecution) {
				const result = await invokeAppToolCallback(
					request.toolExecution,
					tool,
					args,
					logger.scope("tool-callback"),
				);
				logger.log("app tool callback completed", {
					tool,
					success: result.success,
					contentItems: result.contentItems.length,
				});
				await connection.respondWithResult(message.id, result);
				return;
			}

			logger.error("tool call requested without execution config", {
				tool,
			});
			await connection.respondWithResult(message.id, {
				contentItems: [
					{
						type: "inputText",
						text: "Codex requested a dynamic tool call but this run has neither `mcpServers` nor `toolExecution` configured.",
					},
				],
				success: false,
			});
			return;
		}

		if (await tryRespondToCodexServerRequest(connection, message, state)) {
			return;
		}

		await connection.respondWithError(
			message.id,
			-32601,
			"Bridge v1 does not support this server-initiated Codex request.",
		);
		failRun(
			new BridgeError({
				status: 501,
				code: "codex_server_request_not_supported",
				message:
					"Codex requested a capability the bridge does not implement yet.",
				detail: `Unsupported server request: ${message.method}`,
				suggestedAction:
					"Retry with a simpler prompt, re-authenticate if the session expired, or extend the bridge for this JSON-RPC method.",
				metadata: {
					method: message.method,
					provider: request.provider,
				},
			}),
		);
	});

	try {
		await connection.initialize();
		logger.log("jsonrpc initialized");
		const threadStartParams: Record<string, unknown> = {
			model: request.model,
			approvalPolicy: "never",
			// Codex expects kebab-case permission variants on `thread/start`.
			sandbox: "workspace-write",
			serviceName: "polarish-bridge",
		};
		const appDynamicTools: CodexDynamicToolSpec[] = (request.tools ?? []).map(
			(t) => ({
				name: t.name,
				description: typeof t.description === "string" ? t.description : "",
				inputSchema: t.inputSchema ?? {
					type: "object",
					properties: {},
					additionalProperties: true,
				},
			}),
		);
		const mergedDynamicTools = [
			...appDynamicTools,
			...(mcpRegistry?.dynamicTools ?? []),
		];
		if (mergedDynamicTools.length > 0) {
			threadStartParams.dynamicTools = mergedDynamicTools;
		}
		logger.log("starting codex thread", {
			dynamicToolNames: mergedDynamicTools.map((tool) => tool.name),
		});
		const thread = (await connection.request(
			"thread/start",
			threadStartParams,
		)) as {
			thread?: { id?: unknown };
		};
		const threadId = thread.thread?.id;
		if (typeof threadId !== "string") {
			throw new BridgeError({
				status: 502,
				code: "codex_protocol_error",
				message: "Codex did not return a thread id.",
				metadata: {
					provider: request.provider,
				},
			});
		}

		logger.log("codex thread started", {
			threadId,
		});
		await connection.request("turn/start", {
			threadId,
			input: buildTurnInput(request, state.warnings),
			model: request.model,
			effort: request.temperature > 0.7 ? "high" : "medium",
			approvalPolicy: "never",
			sandboxPolicy: {
				// Codex expects camelCase permission variants on `sandboxPolicy.type`.
				type: "workspaceWrite",
			},
		});
		logger.log("codex turn started", {
			threadId,
			warningCount: state.warnings.length,
		});
	} catch (error) {
		cleanup();
		throw error;
	}

	if (request.stream) {
		logger.log("returning streaming codex result");
		const result: UnifiedResponseStreamingResultType = {
			...stream.result,
			events: queue.events,
		};
		return result;
	}

	try {
		const response = await stream.result.final();
		logger.log("returning batch codex result", {
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
					code: "codex_execution_failed",
					message: "Codex did not complete the request successfully.",
					detail: error instanceof Error ? error.message : String(error),
					metadata: {
						provider: request.provider,
					},
				});
	}
}

async function invokeAppToolCallback(
	config: ToolExecutionCallbackConfigType,
	tool: string,
	args: unknown,
	logger: BridgeRequestLogger,
): Promise<{
	contentItems: CodexDynamicToolCallContentItem[];
	success: boolean;
}> {
	logger.log("invoking app tool callback", {
		tool,
		callbackUrl: config.callbackUrl,
	});
	const res = await fetch(config.callbackUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${config.bearerToken}`,
		},
		body: JSON.stringify({ tool, arguments: args }),
		signal: AbortSignal.timeout(120_000),
	});
	const text = await res.text();
	logger.log("app tool callback http response", {
		tool,
		status: res.status,
		ok: res.ok,
	});
	if (!res.ok) {
		logger.error("app tool callback returned non-ok status", {
			tool,
			status: res.status,
			body: text,
		});
		return {
			contentItems: [
				{
					type: "inputText",
					text: `Tool callback HTTP ${res.status}: ${text}`,
				},
			],
			success: false,
		};
	}
	try {
		const parsed = JSON.parse(text) as {
			contentItems?: unknown;
			success?: unknown;
		};
		if (!Array.isArray(parsed.contentItems)) {
			logger.error("app tool callback json missing contentItems", {
				tool,
				body: text,
			});
			return {
				contentItems: [
					{
						type: "inputText",
						text:
							text.length > 0
								? text
								: "Tool callback returned JSON without a contentItems array.",
					},
				],
				success: false,
			};
		}
		logger.log("app tool callback parsed", {
			tool,
			success: Boolean(parsed.success),
			contentItems: parsed.contentItems.length,
		});
		return {
			contentItems: parsed.contentItems as CodexDynamicToolCallContentItem[],
			success: Boolean(parsed.success),
		};
	} catch {
		logger.error("app tool callback returned non-json body", {
			tool,
			body: text,
		});
		return {
			contentItems: [{ type: "inputText", text }],
			success: false,
		};
	}
}

function createRunState(request: AppRequestShapeType): RunState {
	const warnings: string[] = [];
	if (request.messages.length > 1) {
		warnings.push(
			"Bridge v1 flattened message history into a single Codex turn transcript.",
		);
	}
	return {
		autoInteractiveNoticeSent: false,
		dynamicToolBlockByItemId: new Map(),
		reasoningStarted: new Set<number>(),
		reasoningText: new Map<number, string>(),
		runStatus: "in_progress",
		text: "",
		textBlockStarted: false,
		toolCallContentIndex: 1,
		toolCallParts: [],
		toolCalls: [],
		warnings,
	};
}

function toUnifiedResponse(request: AppRequestShapeType, state: RunState) {
	const content: ResponseContentPartType[] = [];
	if (state.text.length > 0) {
		content.push({
			type: "text",
			text: state.text,
		});
	}

	for (const index of [...state.reasoningText.keys()].sort((a, b) => a - b)) {
		const text = state.reasoningText.get(index);
		if (text) {
			content.push({
				type: "reasoning",
				text,
			});
		}
	}

	for (const part of state.toolCallParts) {
		content.push(part);
	}

	return {
		status: state.runStatus,
		...(state.text ? { text: state.text } : {}),
		content,
		toolCalls: state.toolCalls,
		approvals: [],
		finishReason: state.finishReason,
		providerMetadata: {
			provider: request.provider,
			model: request.model,
			...(state.turnId ? { requestId: state.turnId } : {}),
		},
		warnings: state.warnings,
		...(state.errorMessage ? { errorMessage: state.errorMessage } : {}),
	};
}

function toDoneReason(finishReason: ResponseFinishReasonType) {
	if (finishReason === "length") {
		return "length" as const;
	}
	if (finishReason === "tool-call") {
		return "toolUse" as const;
	}
	return "stop" as const;
}

function noteAutoInteractiveCodexRequest(state: RunState): void {
	if (state.autoInteractiveNoticeSent) {
		return;
	}
	state.autoInteractiveNoticeSent = true;
	state.warnings.push(
		"Codex sent an approval or user-input request; the bridge responded automatically because /v1/generate is non-interactive.",
	);
}

/** Auto-respond to Codex interactive JSON-RPC prompts; returns true if handled. */
async function tryRespondToCodexServerRequest(
	connection: {
		respondWithResult: (id: number, result: unknown) => Promise<void>;
	},
	message: JsonRpcRequestMessage,
	state: RunState,
): Promise<boolean> {
	switch (message.method) {
		case "item/commandExecution/requestApproval":
		case "item/fileChange/requestApproval":
			noteAutoInteractiveCodexRequest(state);
			await connection.respondWithResult(message.id, { decision: "accept" });
			return true;
		case "item/permissions/requestApproval":
			noteAutoInteractiveCodexRequest(state);
			await connection.respondWithResult(message.id, {
				permissions: {},
				scope: "turn",
			});
			return true;
		case "item/tool/requestUserInput":
			noteAutoInteractiveCodexRequest(state);
			await connection.respondWithResult(message.id, { answers: {} });
			return true;
		case "mcpServer/elicitation/request":
			noteAutoInteractiveCodexRequest(state);
			await connection.respondWithResult(message.id, { action: "decline" });
			return true;
		case "applyPatchApproval":
		case "execCommandApproval":
			noteAutoInteractiveCodexRequest(state);
			await connection.respondWithResult(message.id, { decision: "approved" });
			return true;
		default:
			return false;
	}
}

function pushDynamicToolCallStartEvents(
	state: RunState,
	queue: ReturnType<typeof createEventQueue>,
	contentIndex: number,
	arguments_: unknown,
): void {
	queue.push({
		type: "toolcall_start",
		contentIndex,
		partial: toUnifiedPartial(state),
	});
	const argsText = arguments_ !== undefined ? JSON.stringify(arguments_) : "";
	if (argsText.length > 0) {
		queue.push({
			type: "toolcall_delta",
			contentIndex,
			delta: argsText,
			partial: toUnifiedPartial(state),
		});
	}
}

function handleNotification(
	notification: JsonRpcNotificationMessage,
	state: RunState,
	queue: ReturnType<typeof createEventQueue>,
): void {
	const params = isRecord(notification.params) ? notification.params : {};

	switch (notification.method) {
		case "turn/started": {
			const turn = isRecord(params.turn) ? params.turn : undefined;
			if (turn && typeof turn.id === "string") {
				state.turnId = turn.id;
			}
			queue.push({
				type: "start",
				partial: toUnifiedPartial(state),
			});
			break;
		}
		case "item/started": {
			const item = isRecord(params.item) ? params.item : undefined;
			if (!item || item.type !== "dynamicToolCall") {
				break;
			}
			const itemId = typeof item.id === "string" ? item.id : "";
			const tool = typeof item.tool === "string" ? item.tool : "";
			const contentIndex = state.toolCallContentIndex;
			state.toolCallContentIndex += 1;
			state.dynamicToolBlockByItemId.set(itemId, { contentIndex, tool });
			pushDynamicToolCallStartEvents(
				state,
				queue,
				contentIndex,
				item.arguments,
			);
			break;
		}
		case "item/agentMessage/delta": {
			const delta =
				getString(params, "delta") ?? getString(params, "textDelta") ?? "";
			if (!state.textBlockStarted) {
				state.textBlockStarted = true;
				queue.push({
					type: "text_start",
					contentIndex: 0,
					partial: toUnifiedPartial(state),
				});
			}
			state.text += delta;
			queue.push({
				type: "text_delta",
				contentIndex: 0,
				delta,
				partial: toUnifiedPartial(state),
			});
			break;
		}
		case "item/reasoning/summaryPartAdded": {
			const summaryIndex = getNumber(params, "summaryIndex") ?? 0;
			if (!state.reasoningStarted.has(summaryIndex)) {
				state.reasoningStarted.add(summaryIndex);
				queue.push({
					type: "thinking_start",
					contentIndex: summaryIndex,
					partial: toUnifiedPartial(state),
				});
			}
			break;
		}
		case "item/reasoning/summaryTextDelta":
		case "item/reasoning/textDelta": {
			const contentIndex =
				getNumber(params, "summaryIndex") ??
				getNumber(params, "contentIndex") ??
				0;
			const delta =
				getString(params, "delta") ?? getString(params, "textDelta") ?? "";
			if (!state.reasoningStarted.has(contentIndex)) {
				state.reasoningStarted.add(contentIndex);
				queue.push({
					type: "thinking_start",
					contentIndex,
					partial: toUnifiedPartial(state),
				});
			}
			state.reasoningText.set(
				contentIndex,
				`${state.reasoningText.get(contentIndex) ?? ""}${delta}`,
			);
			queue.push({
				type: "thinking_delta",
				contentIndex,
				delta,
				partial: toUnifiedPartial(state),
			});
			break;
		}
		case "item/completed": {
			const item = isRecord(params.item) ? params.item : undefined;
			if (!item || typeof item.type !== "string") {
				break;
			}
			if (item.type === "agentMessage" && typeof item.text === "string") {
				state.text = item.text;
				queue.push({
					type: "text_end",
					contentIndex: 0,
					content: item.text,
					partial: toUnifiedPartial(state),
				});
			}
			if (
				item.type === "reasoning" &&
				Array.isArray(item.summary) &&
				item.summary.length > 0
			) {
				for (const [index, part] of item.summary.entries()) {
					if (typeof part === "string") {
						state.reasoningText.set(index, part);
						queue.push({
							type: "thinking_end",
							contentIndex: index,
							content: part,
							partial: toUnifiedPartial(state),
						});
					}
				}
			}
			if (item.type === "dynamicToolCall") {
				const itemId = typeof item.id === "string" ? item.id : "";
				let block = state.dynamicToolBlockByItemId.get(itemId);
				if (!block) {
					const contentIndex = state.toolCallContentIndex;
					state.toolCallContentIndex += 1;
					const tool =
						typeof item.tool === "string" ? item.tool : "unknown_tool";
					block = { contentIndex, tool };
					state.dynamicToolBlockByItemId.set(itemId, block);
					pushDynamicToolCallStartEvents(
						state,
						queue,
						block.contentIndex,
						item.arguments,
					);
				}
				const toolCall: ToolCallContentPart = {
					type: "tool-call",
					id: itemId || `dyn_${block.contentIndex}`,
					name:
						(typeof item.tool === "string" ? item.tool : undefined) ??
						block.tool,
					arguments: item.arguments,
				};
				state.toolCallParts.push(toolCall);
				state.toolCalls.push(toolCall);
				state.dynamicToolBlockByItemId.delete(itemId);
				queue.push({
					type: "toolcall_end",
					contentIndex: block.contentIndex,
					toolCall,
					partial: toUnifiedPartial(state),
				});
			}
			break;
		}
		case "turn/completed": {
			const turn = isRecord(params.turn) ? params.turn : {};
			const status = getString(turn, "status");
			if (status === "interrupted") {
				state.runStatus = "aborted";
				state.finishReason = "abort";
				state.errorMessage = getString(turn, "error") ?? "Turn interrupted";
				return;
			}
			if (status === "failed") {
				state.runStatus = "failed";
				state.finishReason = "error";
				const error = isRecord(turn.error) ? turn.error : undefined;
				state.errorMessage =
					(error && getString(error, "message")) || "Codex run failed";
				return;
			}
			state.runStatus = "completed";
			state.finishReason = "stop";
			return;
		}
		default:
			break;
	}
}

function buildTurnInput(
	request: AppRequestShapeType,
	warnings: string[],
): CodexInputItem[] {
	const items: CodexInputItem[] = [];
	const transcript = [
		request.system.trim()
			? `System instructions:\n${request.system.trim()}`
			: undefined,
		buildTranscript(request),
	]
		.filter((value): value is string => Boolean(value))
		.join("\n\n");
	items.push({
		type: "text",
		text: transcript,
	});

	const lastUserMessage = [...request.messages]
		.reverse()
		.find((message) => message.role === "user");
	if (!lastUserMessage || typeof lastUserMessage.content === "string") {
		return items;
	}

	for (const part of lastUserMessage.content) {
		if (part.type !== "attachment") {
			continue;
		}
		if (part.kind !== "image") {
			throw new BridgeError({
				status: 400,
				code: "codex_attachment_not_supported",
				message:
					"Codex bridge v1 only supports image attachments on the last user message.",
				detail: `Unsupported attachment kind: ${part.kind}`,
				suggestedAction:
					"Send text-only requests for now, or wait for broader attachment support in the bridge.",
				metadata: {
					provider: request.provider,
				},
			});
		}
		if (part.source.type !== "url") {
			throw new BridgeError({
				status: 400,
				code: "codex_attachment_not_supported",
				message:
					"Codex bridge v1 only supports image attachments that already have a URL.",
				detail: `Unsupported image source: ${part.source.type}`,
				suggestedAction:
					"Upload the image somewhere reachable by URL before sending the request.",
				metadata: {
					provider: request.provider,
				},
			});
		}
		items.push({
			type: "image",
			url: part.source.url,
		});
		warnings.push(
			"Bridge v1 forwarded only URL-backed image attachments on the last user message.",
		);
	}

	return items;
}

function toUnifiedPartial(state: RunState) {
	return {
		status: "in_progress" as const,
		...(state.text ? { text: state.text } : {}),
		content: buildPartialContent(state),
		toolCalls: state.toolCalls,
		approvals: [],
		warnings: state.warnings,
	};
}

function buildPartialContent(state: RunState): ResponseContentPartType[] {
	const content: ResponseContentPartType[] = [];
	if (state.text) {
		content.push({
			type: "text",
			text: state.text,
		});
	}
	for (const index of [...state.reasoningText.keys()].sort((a, b) => a - b)) {
		const text = state.reasoningText.get(index);
		if (text) {
			content.push({
				type: "reasoning",
				text,
			});
		}
	}
	for (const part of state.toolCallParts) {
		content.push(part);
	}
	return content;
}

function createJsonRpcConnection(
	child: ReturnType<typeof spawn>,
	onFatalError: (error: unknown) => void,
	logger: BridgeRequestLogger,
) {
	if (!child.stdout || !child.stdin || !child.stderr) {
		throw new BridgeError({
			status: 500,
			code: "codex_start_failed",
			message: "Codex did not expose the stdio pipes the bridge expected.",
		});
	}

	let nextId = 1;
	const pending = new Map<
		number,
		{
			reject: (reason?: unknown) => void;
			resolve: (value: unknown) => void;
		}
	>();
	const notificationListeners = new Set<
		(message: JsonRpcNotificationMessage) => void
	>();
	const serverRequestListeners = new Set<
		(message: JsonRpcRequestMessage) => void
	>();
	const rl = readline.createInterface({ input: child.stdout });

	const writeMessage = (message: unknown) => {
		if (isRecord(message)) {
			logger.log("jsonrpc outbound", {
				method: getString(message, "method"),
				id: getNumber(message, "id"),
			});
		}
		child.stdin?.write(`${JSON.stringify(message)}\n`);
	};

	rl.on("line", (line) => {
		try {
			const message = JSON.parse(line) as
				| JsonRpcResponseMessage
				| JsonRpcNotificationMessage
				| JsonRpcRequestMessage;
			logger.log("jsonrpc inbound line", {
				hasId:
					typeof (message as JsonRpcRequestMessage).id === "number" ||
					typeof (message as JsonRpcResponseMessage).id === "number",
				method: getString(message as Record<string, unknown>, "method"),
			});
			if (
				typeof (message as JsonRpcRequestMessage).id === "number" &&
				typeof (message as JsonRpcRequestMessage).method === "string"
			) {
				for (const listener of serverRequestListeners) {
					listener(message as JsonRpcRequestMessage);
				}
				return;
			}
			if (
				typeof (message as JsonRpcResponseMessage).id === "number" &&
				("result" in message || "error" in message)
			) {
				const response = message as JsonRpcResponseMessage;
				const waiter = pending.get(response.id);
				if (!waiter) {
					return;
				}
				pending.delete(response.id);
				if (response.error) {
					logger.error("jsonrpc response error", {
						id: response.id,
						code: response.error.code,
						message: response.error.message,
					});
					waiter.reject(
						new BridgeError({
							status: 502,
							code: "codex_protocol_error",
							message:
								response.error.message ??
								"Codex returned a JSON-RPC error response.",
							metadata: {
								code: response.error.code,
							},
						}),
					);
					return;
				}
				logger.log("jsonrpc response resolved", {
					id: response.id,
				});
				waiter.resolve(response.result);
				return;
			}
			if (typeof (message as JsonRpcNotificationMessage).method === "string") {
				for (const listener of notificationListeners) {
					listener(message as JsonRpcNotificationMessage);
				}
			}
		} catch (error) {
			logger.error("jsonrpc line parse failed", {
				error: error instanceof Error ? error.message : String(error),
				line,
			});
			onFatalError(error);
		}
	});

	child.stderr.on("data", (chunk) => {
		const text =
			typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		logger.log("codex stderr", {
			text: text.trim(),
		});
	});

	child.on("error", (error) => {
		logger.error("codex child process error", {
			error: error.message,
		});
		onFatalError(
			new BridgeError({
				status: 502,
				code: "codex_start_failed",
				message: "Codex could not be started by the bridge.",
				detail: error.message,
			}),
		);
	});

	return {
		dispose(): void {
			rl.close();
			for (const [id, waiter] of pending.entries()) {
				pending.delete(id);
				waiter.reject(
					new BridgeError({
						status: 502,
						code: "codex_execution_failed",
						message: "Codex closed before finishing the request.",
					}),
				);
			}
		},
		async initialize(): Promise<void> {
			logger.log("sending initialize request");
			await this.request("initialize", {
				clientInfo: {
					name: "polarish_bridge",
					title: "Polarish Bridge",
					version: "0.1.0",
				},
				capabilities: {
					experimentalApi: true,
				},
			});
			writeMessage({
				method: "initialized",
				params: {},
			});
			logger.log("sent initialized notification");
		},
		onNotification(
			listener: (message: JsonRpcNotificationMessage) => void,
		): void {
			notificationListeners.add(listener);
		},
		onServerRequest(listener: (message: JsonRpcRequestMessage) => void): void {
			serverRequestListeners.add(listener);
		},
		request(method: string, params?: unknown): Promise<unknown> {
			const id = nextId;
			nextId += 1;
			writeMessage({
				id,
				method,
				...(params !== undefined ? { params } : {}),
			});
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
			});
		},
		async respondWithError(
			id: number,
			code: number,
			message: string,
		): Promise<void> {
			logger.error("jsonrpc respond with error", {
				id,
				code,
				message,
			});
			writeMessage({
				id,
				error: {
					code,
					message,
				},
			});
		},
		async respondWithResult(id: number, result: unknown): Promise<void> {
			logger.log("jsonrpc respond with result", {
				id,
			});
			writeMessage({
				id,
				result,
			});
		},
	};
}

function createCleanup(
	child: ReturnType<typeof spawn>,
	connection: ReturnType<typeof createJsonRpcConnection>,
	closeQueue: () => void,
	failFinal: (error?: unknown) => void,
) {
	let done = false;

	return (cause?: unknown) => {
		if (done) {
			return;
		}
		done = true;
		connection.dispose();
		closeQueue();
		if (cause) {
			failFinal(cause);
		}
		if (!child.killed) {
			child.kill();
		}
	};
}
