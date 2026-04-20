import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { appRequestShape } from "../request.ts";
import { aiDebugLog } from "./debug.ts";
import type { ToolCallbackHost } from "./tool-callback-host.types.ts";

export type { ToolCallbackHost } from "./tool-callback-host.types.ts";

/** Localhost HTTP server: runs tool `execute()` when the bridge forwards Codex `item/tool/call`. */
export async function createToolCallbackHost(
	tools: NonNullable<appRequestShape["tools"]>,
	signal?: AbortSignal,
): Promise<ToolCallbackHost> {
	const byName = new Map(tools.map((t) => [t.name, t]));
	const bearerToken = randomBytes(32).toString("hex");
	aiDebugLog("tool-callback-host", "created bearer token and tool map", {
		toolNames: tools.map((tool) => tool.name),
	});

	const server = createServer((req, res) => {
		if (req.method !== "POST" || req.url !== "/invoke") {
			res.writeHead(404).end();
			return;
		}
		const auth = req.headers.authorization;
		if (auth !== `Bearer ${bearerToken}`) {
			aiDebugLog("tool-callback-host", "reject invoke auth", {
				path: req.url,
				authPresent: typeof auth === "string",
			});
			res.writeHead(401).end();
			return;
		}
		let body = "";
		req.on("data", (chunk) => {
			body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		});
		req.on("end", () => {
			void (async () => {
				try {
					const payload = JSON.parse(body) as {
						tool?: string;
						arguments?: unknown;
					};
					const toolName = typeof payload.tool === "string" ? payload.tool : "";
					aiDebugLog("tool-callback-host", "invoke received", {
						toolName,
					});
					const toolDef = byName.get(toolName);
					if (!toolDef?.execute) {
						aiDebugLog("tool-callback-host", "unknown or non-executable tool", {
							toolName,
						});
						res.writeHead(200, { "content-type": "application/json" });
						res.end(
							JSON.stringify({
								contentItems: [
									{
										type: "inputText",
										text: `Unknown or non-executable tool: ${toolName}`,
									},
								],
								success: false,
							}),
						);
						return;
					}
					aiDebugLog("tool-callback-host", "running tool execute", {
						toolName,
					});
					const result = await (
						toolDef.execute as (input: unknown) => Promise<unknown>
					)(payload.arguments);
					const text =
						typeof result === "string" ? result : JSON.stringify(result);
					aiDebugLog("tool-callback-host", "tool execute done", {
						toolName,
					});
					res.writeHead(200, { "content-type": "application/json" });
					res.end(
						JSON.stringify({
							contentItems: [{ type: "inputText", text }],
							success: true,
						}),
					);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					aiDebugLog("tool-callback-host", "tool execute error", {
						error: message,
					});
					res.writeHead(200, { "content-type": "application/json" });
					res.end(
						JSON.stringify({
							contentItems: [{ type: "inputText", text: message }],
							success: false,
						}),
					);
				}
			})();
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});

	const addr = server.address();
	if (addr === null || typeof addr === "string") {
		server.close();
		throw new Error("Tool callback server failed to bind.");
	}

	const callbackUrl = `http://127.0.0.1:${addr.port}/invoke`;
	aiDebugLog("tool-callback-host", "server listening", {
		callbackUrl,
	});

	const dispose = (): void => {
		aiDebugLog("tool-callback-host", "server disposing", {
			callbackUrl,
		});
		server.close();
	};
	if (signal) {
		signal.addEventListener("abort", dispose, { once: true });
	}

	return {
		toolExecution: { callbackUrl, bearerToken },
		dispose,
	};
}
