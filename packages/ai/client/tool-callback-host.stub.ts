import type { appRequestShape } from "../request.ts";
import type { ToolCallbackHost } from "./tool-callback-host.types.ts";

export type { ToolCallbackHost } from "./tool-callback-host.types.ts";

/**
 * Browser / non-Node bundles: the real implementation lives in `tool-callback-host.node.ts`.
 * Resolved via `package.json` `imports` (`#tool-callback-host`) using the `browser` condition.
 */
export async function createToolCallbackHost(
	_tools: NonNullable<appRequestShape["tools"]>,
	_signal?: AbortSignal,
): Promise<ToolCallbackHost> {
	throw new Error(
		"openai-codex tools with `execute` need Node.js to run the local callback host. In the browser, remove `execute` from tools or call the bridge from a backend.",
	);
}
