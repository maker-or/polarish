import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	type BridgeConfig,
	DEFAULT_BRIDGE_CONFIG,
	mergeBridgeConfig,
} from "../lib/bridge-config.js";

export type { BridgeConfig } from "../lib/bridge-config.js";
export {
	DEFAULT_BRIDGE_CONFIG,
	mergeBridgeConfig,
	mergeRuntimePartial,
} from "../lib/bridge-config.js";

/**
 * This returns the OS-specific config directory for the bridge (alternate legacy layout).
 */
export function getBridgeConfigDir(): string {
	if (process.platform === "darwin") {
		return path.join(
			os.homedir(),
			"Library",
			"Application Support",
			"polarish",
		);
	}

	if (process.platform === "win32") {
		const base =
			process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
		return path.join(base, "polarish");
	}

	const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
	return path.join(xdg, "polarish");
}

/**
 * This returns the persisted bridge config file path.
 */
export function getBridgeConfigPath(): string {
	return path.join(getBridgeConfigDir(), "bridge.json");
}

/**
 * This reads the bridge config from disk and falls back to defaults when missing.
 */
export async function readBridgeConfig(): Promise<BridgeConfig> {
	try {
		const raw = await readFile(getBridgeConfigPath(), "utf8");
		const parsed = JSON.parse(raw) as Partial<BridgeConfig>;
		return mergeBridgeConfig(parsed);
	} catch {
		return structuredClone(DEFAULT_BRIDGE_CONFIG);
	}
}

/**
 * This writes the full bridge config to disk.
 */
export async function writeBridgeConfig(config: BridgeConfig): Promise<void> {
	const filePath = getBridgeConfigPath();
	await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
	await writeFile(filePath, JSON.stringify(config, null, 2), {
		encoding: "utf8",
		mode: 0o600,
	});
}
