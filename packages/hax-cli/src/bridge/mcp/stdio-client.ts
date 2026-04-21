import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import readline from "node:readline";
import type { McpServerStdioConfigType } from "../contracts.js";
import type { BridgeRequestLogger } from "../shared.js";

type JsonRpcRequest = {
	jsonrpc?: string;
	id?: number;
	method: string;
	params?: unknown;
};

type JsonRpcResponse = {
	jsonrpc?: string;
	id: number;
	result?: unknown;
	error?: { code?: number; message?: string };
};

const MCP_PROTOCOL_VERSION = "2024-11-05";

export type McpListedTool = {
	name: string;
	description?: string;
	inputSchema?: unknown;
};

export type CodexDynamicToolCallContentItem =
	| { type: "inputText"; text: string }
	| { type: "inputImage"; imageUrl: string };

/**
 * This is one connected MCP server over stdio (JSON-RPC lines).
 */
export class McpStdioClient {
	readonly serverAlias: string;
	readonly logger: BridgeRequestLogger;
	private child?: ChildProcessWithoutNullStreams;
	private rl?: readline.Interface;
	private nextId = 1;
	private readonly pending = new Map<
		number,
		{ resolve: (v: unknown) => void; reject: (e: unknown) => void }
	>();

	constructor(
		serverAlias: string,
		private readonly config: McpServerStdioConfigType,
		logger: BridgeRequestLogger,
	) {
		this.serverAlias = serverAlias;
		this.logger = logger;
	}

	async connect(): Promise<void> {
		this.logger.log("spawning mcp stdio server", {
			command: this.config.command,
			args: this.config.args ?? [],
		});
		const env = { ...process.env, ...this.config.env };
		const child = spawn(this.config.command, this.config.args ?? [], {
			env,
			stdio: ["pipe", "pipe", "pipe"],
			shell: process.platform === "win32",
		});
		this.child = child;
		if (!child.stdout || !child.stdin) {
			throw new Error("MCP child missing stdio pipes.");
		}

		const rl = readline.createInterface({ input: child.stdout });
		this.rl = rl;
		rl.on("line", (line) => this.onLine(line));

		child.on("error", (err) => {
			this.logger.error("mcp child process error", {
				error: err.message,
			});
			for (const [, waiter] of this.pending) {
				waiter.reject(err);
			}
			this.pending.clear();
		});

		this.logger.log("sending mcp initialize");
		await this.request("initialize", {
			protocolVersion: MCP_PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: {
				name: "polarish-bridge",
				title: "Polarish Bridge MCP client",
				version: "0.1.0",
			},
		});

		this.notify("notifications/initialized", {});
		this.logger.log("mcp initialized");
	}

	private onLine(line: string): void {
		if (!line.trim()) {
			return;
		}
		let msg: JsonRpcResponse | JsonRpcRequest;
		try {
			msg = JSON.parse(line) as JsonRpcResponse | JsonRpcRequest;
		} catch {
			this.logger.error("failed to parse mcp json line", {
				line,
			});
			return;
		}
		this.logger.log("mcp inbound line", {
			id:
				typeof (msg as JsonRpcResponse).id === "number"
					? (msg as JsonRpcResponse).id
					: (msg as JsonRpcRequest).id,
			method: (msg as JsonRpcRequest).method,
		});
		if (typeof (msg as JsonRpcResponse).id === "number") {
			const res = msg as JsonRpcResponse;
			const waiter = this.pending.get(res.id);
			if (!waiter) {
				return;
			}
			this.pending.delete(res.id);
			if (res.error) {
				this.logger.error("mcp jsonrpc error response", {
					id: res.id,
					code: res.error.code,
					message: res.error.message,
				});
				waiter.reject(new Error(res.error.message ?? "MCP JSON-RPC error"));
				return;
			}
			this.logger.log("mcp jsonrpc response resolved", {
				id: res.id,
			});
			waiter.resolve(res.result);
		}
	}

	private write(message: unknown): void {
		if (!this.child?.stdin) {
			throw new Error("MCP stdin closed.");
		}
		if (message && typeof message === "object") {
			const record = message as Record<string, unknown>;
			this.logger.log("mcp outbound line", {
				id: typeof record.id === "number" ? record.id : undefined,
				method: typeof record.method === "string" ? record.method : undefined,
			});
		}
		this.child.stdin.write(`${JSON.stringify(message)}\n`);
	}

	private request(method: string, params?: unknown): Promise<unknown> {
		const id = this.nextId;
		this.nextId += 1;
		this.write({
			jsonrpc: "2.0",
			id,
			method,
			...(params !== undefined ? { params } : {}),
		});
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});
	}

	private notify(method: string, params: unknown): void {
		this.write({
			jsonrpc: "2.0",
			method,
			params,
		});
	}

	async listTools(): Promise<McpListedTool[]> {
		this.logger.log("listing mcp tools");
		const result = (await this.request("tools/list", {})) as {
			tools?: McpListedTool[];
		};
		this.logger.log("listed mcp tools", {
			toolNames: (result.tools ?? []).map((tool) => tool.name),
		});
		return result.tools ?? [];
	}

	/**
	 * This runs MCP tools/call and maps the result into Codex dynamic tool output items.
	 */
	async callToolAsCodexOutput(
		toolName: string,
		args: unknown,
	): Promise<{
		contentItems: CodexDynamicToolCallContentItem[];
		success: boolean;
	}> {
		this.logger.log("calling mcp tool", {
			toolName,
			hasArgs: args !== undefined,
		});
		const raw = (await this.request("tools/call", {
			name: toolName,
			arguments:
				args && typeof args === "object" && !Array.isArray(args) ? args : {},
		})) as {
			content?: unknown[];
			isError?: boolean;
		};

		const contentItems = mapMcpContentToCodex(raw.content);
		const success = raw.isError !== true;
		this.logger.log("mcp tool call completed", {
			toolName,
			success,
			contentItems: contentItems.length,
		});
		return { contentItems, success };
	}

	dispose(): void {
		this.logger.log("disposing mcp client");
		this.rl?.close();
		this.rl = undefined;
		for (const [, waiter] of this.pending) {
			waiter.reject(new Error("MCP session disposed."));
		}
		this.pending.clear();
		if (this.child && !this.child.killed) {
			this.child.kill();
		}
		this.child = undefined;
	}
}

function mapMcpContentToCodex(
	content: unknown[] | undefined,
): CodexDynamicToolCallContentItem[] {
	if (!Array.isArray(content)) {
		return [];
	}
	const out: CodexDynamicToolCallContentItem[] = [];
	for (const block of content) {
		if (!block || typeof block !== "object") {
			continue;
		}
		const b = block as Record<string, unknown>;
		const type = b.type;
		if (type === "text") {
			const text = typeof b.text === "string" ? b.text : "";
			if (text.length > 0) {
				out.push({ type: "inputText", text });
			}
			continue;
		}
		if (type === "image") {
			const mime = typeof b.mimeType === "string" ? b.mimeType : "image/png";
			const data = typeof b.data === "string" ? b.data : "";
			if (data.length > 0) {
				out.push({
					type: "inputImage",
					imageUrl: `data:${mime};base64,${data}`,
				});
			}
		}
	}
	return out;
}
