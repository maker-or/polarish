import type { McpServerStdioConfigType } from "../contracts.js";
import type { BridgeRequestLogger } from "../shared.js";
import {
	type CodexDynamicToolCallContentItem,
	McpStdioClient,
} from "./stdio-client.js";

export type CodexDynamicToolSpec = {
	name: string;
	description: string;
	inputSchema: unknown;
};

type Route = {
	client: McpStdioClient;
	originalName: string;
};

/**
 * This spawns every configured MCP server, lists tools, and routes Codex `item/tool/call` by qualified name.
 */
export class McpBridgeRegistry {
	readonly dynamicTools: CodexDynamicToolSpec[];

	private readonly clients: McpStdioClient[];

	private readonly routes: Map<string, Route>;

	private constructor(
		dynamicTools: CodexDynamicToolSpec[],
		clients: McpStdioClient[],
		routes: Map<string, Route>,
	) {
		this.dynamicTools = dynamicTools;
		this.clients = clients;
		this.routes = routes;
	}

	static async create(
		servers: Record<string, McpServerStdioConfigType>,
		logger: BridgeRequestLogger,
	): Promise<McpBridgeRegistry> {
		const clients: McpStdioClient[] = [];
		const dynamicTools: CodexDynamicToolSpec[] = [];
		const routes = new Map<string, Route>();

		try {
			for (const [alias, cfg] of Object.entries(servers)) {
				logger.log("connecting mcp server", {
					alias,
					command: cfg.command,
					args: cfg.args ?? [],
				});
				const client = new McpStdioClient(alias, cfg, logger.scope(alias));
				await client.connect();
				clients.push(client);
				const listed = await client.listTools();
				logger.log("mcp server listed tools", {
					alias,
					toolNames: listed.map((tool) => tool.name),
				});
				for (const t of listed) {
					const qualified = `mcp__${alias}__${t.name}`;
					routes.set(qualified, { client, originalName: t.name });
					dynamicTools.push({
						name: qualified,
						description: t.description ?? "",
						inputSchema: t.inputSchema ?? {
							type: "object",
							properties: {},
							additionalProperties: true,
						},
					});
				}
			}
			logger.log("mcp registry assembled", {
				toolNames: dynamicTools.map((tool) => tool.name),
			});
			return new McpBridgeRegistry(dynamicTools, clients, routes);
		} catch (error) {
			logger.error("mcp registry setup failed", {
				error: error instanceof Error ? error.message : String(error),
			});
			for (const c of clients) {
				c.dispose();
			}
			throw error;
		}
	}

	async executeToolCall(
		tool: string,
		args: unknown,
	): Promise<{
		contentItems: CodexDynamicToolCallContentItem[];
		success: boolean;
	}> {
		const route = this.routes.get(tool);
		if (!route) {
			return {
				contentItems: [
					{
						type: "inputText",
						text: `Unknown dynamic tool: ${tool}`,
					},
				],
				success: false,
			};
		}
		try {
			route.client.logger.log("executing routed mcp tool", {
				qualifiedTool: tool,
				originalName: route.originalName,
			});
			return await route.client.callToolAsCodexOutput(route.originalName, args);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			route.client.logger.error("mcp tool execution failed", {
				qualifiedTool: tool,
				originalName: route.originalName,
				error: message,
			});
			return {
				contentItems: [{ type: "inputText", text: message }],
				success: false,
			};
		}
	}

	dispose(): void {
		for (const c of this.clients) {
			c.dispose();
		}
	}
}
