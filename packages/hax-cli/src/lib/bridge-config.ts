import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBridgeConfigJsonPath } from "./paths.js";

/**
 * This is the bridge config shape stored by the CLI.
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
 * This is the default config the CLI writes for the bridge.
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
 * This reads the local bridge config and falls back to defaults when missing.
 */
export async function readBridgeConfig(): Promise<BridgeConfig> {
	try {
		const raw = await readFile(getBridgeConfigJsonPath(), "utf8");
		return mergeBridgeConfig(JSON.parse(raw) as Partial<BridgeConfig>);
	} catch {
		return structuredClone(DEFAULT_BRIDGE_CONFIG);
	}
}

/**
 * This writes the full bridge config to disk.
 */
export async function writeBridgeConfig(config: BridgeConfig): Promise<void> {
	const filePath = getBridgeConfigJsonPath();
	await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
	await writeFile(filePath, JSON.stringify(config, null, 2), {
		encoding: "utf8",
		mode: 0o600,
	});
}

/**
 * This returns the merged bridge config with defaults applied.
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

/**
 * This adds one browser origin to the bridge config when it is not already present.
 */
export async function addAllowedOrigin(origin: string): Promise<BridgeConfig> {
	const config = await readBridgeConfig();
	if (!config.security.allowedOrigins.includes(origin)) {
		config.security.allowedOrigins.push(origin);
		await writeBridgeConfig(config);
	}
	return config;
}

/**
 * This removes one browser origin from the bridge config when present.
 */
export async function removeAllowedOrigin(
	origin: string,
): Promise<BridgeConfig> {
	const config = await readBridgeConfig();
	config.security.allowedOrigins = config.security.allowedOrigins.filter(
		(candidate) => candidate !== origin,
	);
	await writeBridgeConfig(config);
	return config;
}
