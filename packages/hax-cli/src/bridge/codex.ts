import { execFile, spawn } from "node:child_process";
import readline from "node:readline";
import { promisify } from "node:util";
import {
	type AppRequestShapeType,
	type ResponseContentPartType,
	type ResponseFinishReasonType,
	type UnifiedGenerateResultType,
	type UnifiedResponseStreamingResultType,
	createUnifiedResponseStream,
	unifiedResponseForStreamError,
} from "./contracts.js";
import { BridgeError } from "./errors.js";
import {
	type AdapterAvailability,
	type ExecuteContext,
	buildTranscript,
	createEventQueue,
	getNumber,
	getString,
	isRecord,
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

type RunState = {
	content: ResponseContentPartType[];
	errorMessage?: string;
	finishReason?: ResponseFinishReasonType;
	reasoningStarted: Set<number>;
	reasoningText: Map<number, string>;
	runStatus: "in_progress" | "completed" | "failed" | "aborted";
	text: string;
	textBlockStarted: boolean;
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
 */
export async function checkCodexAvailability(): Promise<AdapterAvailability> {
	try {
		const version = await execFileAsync("codex", ["--version"]);
		const status = await execFileAsync("codex", ["login", "status"]);
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
	if (request.tools?.length) {
		throw new BridgeError({
			status: 400,
			code: "codex_dynamic_tools_not_supported",
			message:
				"Codex bridge v1 does not support application tool definitions yet.",
			suggestedAction:
				"Remove `tools` from this request for now, or wait for dynamic tool support in the bridge.",
			metadata: {
				provider: request.provider,
				toolCount: request.tools.length,
			},
		});
	}

	const availability = await checkCodexAvailability();
	if (!availability.installed) {
		throw new BridgeError({
			status: 503,
			code: "codex_not_installed",
			message: "Codex is not installed on this machine.",
			detail: availability.detail,
			suggestedAction: "Install the Codex CLI and retry the request.",
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

	void context.transport;

	const stream = createUnifiedResponseStream();
	const state = createRunState(request);
	const queue = createEventQueue();
	const child = spawn("codex", ["app-server"], {
		stdio: ["pipe", "pipe", "pipe"],
		shell: process.platform === "win32",
	});
	const connection = createJsonRpcConnection(child, queue.pushError);
	const cleanup = createCleanup(
		child,
		connection,
		queue.close,
		stream.controller.error,
	);

	const failRun = (error: unknown) => {
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

	if (context.signal) {
		context.signal.addEventListener(
			"abort",
			() => {
				if (state.runStatus !== "in_progress") {
					return;
				}
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
		handleNotification(notification, state, queue);
		if (notification.method === "turn/completed") {
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
		await connection.respondWithError(
			message.id,
			-32601,
			"Bridge v1 does not support server-initiated Codex requests.",
		);
		failRun(
			new BridgeError({
				status: 501,
				code: "codex_server_request_not_supported",
				message:
					"Codex requested an interactive capability the bridge does not support yet.",
				detail: `Unsupported server request: ${message.method}`,
				suggestedAction:
					"Retry with a simpler prompt that does not require local tools, approvals, or interactive Codex features.",
				metadata: {
					method: message.method,
					provider: request.provider,
				},
			}),
		);
	});

	try {
		await connection.initialize();
		const thread = (await connection.request("thread/start", {
			model: request.model,
			approvalPolicy: "never",
			// Codex expects kebab-case permission variants on `thread/start`.
			sandbox: "workspace-write",
			serviceName: "hax-bridge",
		})) as {
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
	} catch (error) {
		cleanup();
		throw error;
	}

	if (request.stream) {
		const result: UnifiedResponseStreamingResultType = {
			...stream.result,
			events: queue.events,
		};
		return result;
	}

	try {
		const response = await stream.result.final();
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

function createRunState(request: AppRequestShapeType): RunState {
	const warnings: string[] = [];
	if (request.messages.length > 1) {
		warnings.push(
			"Bridge v1 flattened message history into a single Codex turn transcript.",
		);
	}
	return {
		content: [],
		reasoningStarted: new Set<number>(),
		reasoningText: new Map<number, string>(),
		runStatus: "in_progress",
		text: "",
		textBlockStarted: false,
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

	return {
		status: state.runStatus,
		...(state.text ? { text: state.text } : {}),
		content,
		toolCalls: [],
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
		toolCalls: [],
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
	return content;
}

function createJsonRpcConnection(
	child: ReturnType<typeof spawn>,
	onFatalError: (error: unknown) => void,
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
		child.stdin?.write(`${JSON.stringify(message)}\n`);
	};

	rl.on("line", (line) => {
		try {
			const message = JSON.parse(line) as
				| JsonRpcResponseMessage
				| JsonRpcNotificationMessage
				| JsonRpcRequestMessage;
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
				waiter.resolve(response.result);
				return;
			}
			if (typeof (message as JsonRpcNotificationMessage).method === "string") {
				for (const listener of notificationListeners) {
					listener(message as JsonRpcNotificationMessage);
				}
			}
		} catch (error) {
			onFatalError(error);
		}
	});

	child.stderr.on("data", (_chunk) => {
		// Codex may log informational lines on stderr; bridge v1 does not surface them.
	});

	child.on("error", (error) => {
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
			await this.request("initialize", {
				clientInfo: {
					name: "hax_bridge",
					title: "Hax Bridge",
					version: "0.1.0",
				},
			});
			writeMessage({
				method: "initialized",
				params: {},
			});
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
			writeMessage({
				id,
				error: {
					code,
					message,
				},
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
