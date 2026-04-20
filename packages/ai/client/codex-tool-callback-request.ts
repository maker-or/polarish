import { createToolCallbackHost } from "#tool-callback-host";
import { toolsToBridgeDynamicToolSpecs } from "../providers/openai-codex/compile-request.ts";
import type { appRequestShape } from "../request.ts";
import type {
	UnifiedResponse,
	UnifiedResponseStreamingResult,
	UnifiedStreamEventType,
} from "../types.ts";
import { aiDebugLog } from "./debug.ts";
import type { ToolCallbackHost } from "./tool-callback-host.types.ts";

export function codexExecutableTools(
	tools: appRequestShape["tools"] | undefined,
): NonNullable<appRequestShape["tools"]> {
	const execTools = (tools ?? []).filter(
		(t) => typeof t.execute === "function",
	);
	aiDebugLog("codex-tools", "filtered executable tools", {
		totalTools: tools?.length ?? 0,
		executableTools: execTools.map((tool) => tool.name),
	});
	return execTools;
}

export function prepareCodexToolBridgeRequest(
	base: appRequestShape,
	host: ToolCallbackHost,
): appRequestShape {
	const execTools = codexExecutableTools(base.tools);
	if (execTools.length === 0) {
		aiDebugLog("codex-request", "no executable tools to bridge", {
			provider: base.provider,
		});
		return base;
	}
	const bridgedTools = toolsToBridgeDynamicToolSpecs(execTools);
	aiDebugLog("codex-request", "prepared bridge request", {
		provider: base.provider,
		toolNames: execTools.map((tool) => tool.name),
		toolExecution: host.toolExecution.callbackUrl,
	});
	return {
		...base,
		tools: bridgedTools,
		toolExecution: host.toolExecution,
	};
}

/** After {@link startCodexToolCallbackIfNeeded}, the bridge must receive `toolExecution` when `tools` are present, or Codex errors (“neither mcpServers nor toolExecution”). */
export function assertCodexBridgeRequestHasToolExecutionIfNeeded(
	request: appRequestShape,
): void {
	if (request.provider !== "openai-codex") {
		return;
	}
	const tools = request.tools;
	if (!tools?.length) {
		return;
	}
	const te = "toolExecution" in request ? request.toolExecution : undefined;
	if (
		te &&
		typeof te.callbackUrl === "string" &&
		typeof te.bearerToken === "string"
	) {
		return;
	}
	throw new Error(
		"openai-codex: this request lists `tools` but not `toolExecution`. The Polarish SDK adds `toolExecution` automatically only when every tool you want to run still has a real `execute` function in this process. If you see this after using a correct-looking tool object, `execute` was almost certainly dropped (e.g. tools crossed a client/server or JSON boundary) or the bundle resolved the browser stub for the callback host while running in Node. Define tools in the same Node context as `run()`/`generate()`, or use `mcpServers` for bridge-side tools.",
	);
}

/** Starts the localhost tool callback when Codex-bound tools define `execute`, and returns the bridged request (`toolExecution` + schema-only tools). */
export async function startCodexToolCallbackIfNeeded(
	request: appRequestShape,
): Promise<{ host: ToolCallbackHost | undefined; request: appRequestShape }> {
	const execTools =
		request.provider === "openai-codex"
			? codexExecutableTools(request.tools)
			: [];
	if (execTools.length === 0) {
		aiDebugLog("tool-callback", "no callback host needed", {
			provider: request.provider,
		});
		return { host: undefined, request };
	}
	aiDebugLog("tool-callback", "starting callback host", {
		provider: request.provider,
		toolNames: execTools.map((tool) => tool.name),
	});
	const host = await createToolCallbackHost(execTools, request.signal);
	aiDebugLog("tool-callback", "callback host ready", {
		callbackUrl: host.toolExecution.callbackUrl,
	});
	return {
		host,
		request: prepareCodexToolBridgeRequest(request, host),
	};
}

/** Runs `dispose` once after streaming ends (`final()` or `events` completion). */
export function attachCodexToolHostCleanupToStream(
	result: UnifiedResponseStreamingResult,
	dispose: () => void,
): UnifiedResponseStreamingResult {
	let disposed = false;
	const safeDispose = () => {
		if (disposed) {
			return;
		}
		disposed = true;
		dispose();
	};

	const wrappedFinal = async (): Promise<UnifiedResponse> => {
		try {
			return await result.final();
		} finally {
			safeDispose();
		}
	};

	const wrappedEvents: AsyncIterable<UnifiedStreamEventType> = {
		[Symbol.asyncIterator]() {
			const inner = result.events[Symbol.asyncIterator]();
			return {
				async next() {
					const step = await inner.next();
					if (step.done) {
						safeDispose();
					}
					return step;
				},
			};
		},
	};

	return {
		...result,
		events: wrappedEvents,
		final: wrappedFinal,
	};
}
