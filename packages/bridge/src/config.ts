import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * This is the local bridge config shape that we persist on disk.
 */
export type BridgeConfig = {
	server: {
		port: number;
	};
	security: {
		allowedOrigins: string[];
	};
};

/**
 * This is the default bridge config used when no file exists yet.
 */
export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
	server: {
		port: 4318,
	},
	security: {
		allowedOrigins: [],
	},
};

/**
 * This returns the OS-specific config directory for the bridge.
 */
export function getBridgeConfigDir(): string {
	if (process.platform === "darwin") {
		return path.join(os.homedir(), "Library", "Application Support", "hax");
	}

	if (process.platform === "win32") {
		const base =
			process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
		return path.join(base, "hax");
	}

	const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
	return path.join(xdg, "hax");
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

/**
 * This normalizes partial config input into the full bridge config shape.
 */
export function mergeBridgeConfig(
	input: Partial<BridgeConfig> | undefined,
): BridgeConfig {
	return {
		server: {
			port:
				typeof input?.server?.port === "number" &&
				Number.isFinite(input.server.port)
					? input.server.port
					: DEFAULT_BRIDGE_CONFIG.server.port,
		},
		security: {
			allowedOrigins: Array.isArray(input?.security?.allowedOrigins)
				? input.security.allowedOrigins.filter(
						(origin): origin is string => typeof origin === "string",
					)
				: [...DEFAULT_BRIDGE_CONFIG.security.allowedOrigins],
		},
	};
}
