import type { BridgeConfig } from "../lib/bridge-config.js";

/**
 * Resolves the Codex CLI binary: `runtime.codexPath` in bridge.json, then `POLARISH_CODEX_PATH`, then `codex` on PATH.
 */
export function resolveCodexExecutable(config: BridgeConfig): string {
	const fromConfig = config.runtime?.codexPath?.trim();
	if (fromConfig) {
		return fromConfig;
	}
	const fromEnv = process.env.POLARISH_CODEX_PATH?.trim();
	if (fromEnv) {
		return fromEnv;
	}
	return "codex";
}

/**
 * Resolves the Claude Code CLI binary: `runtime.claudePath`, then `POLARISH_CLAUDE_PATH`, then `claude` on PATH.
 */
export function resolveClaudeExecutable(config: BridgeConfig): string {
	const fromConfig = config.runtime?.claudePath?.trim();
	if (fromConfig) {
		return fromConfig;
	}
	const fromEnv = process.env.POLARISH_CLAUDE_PATH?.trim();
	if (fromEnv) {
		return fromEnv;
	}
	return "claude";
}
