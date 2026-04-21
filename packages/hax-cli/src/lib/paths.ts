import os from "node:os";
import path from "node:path";

/**
 * Returns the OS-specific config directory for Polarish CLI data (JSON metadata, version-check cache).
 */
export function getPolarishConfigDir(): string {
	if (process.platform === "win32") {
		const base =
			process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
		return path.join(base, "polarish");
	}
	const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
	return path.join(xdg, "polarish");
}

/**
 * Path to the local bridge config file.
 */
export function getBridgeConfigJsonPath(): string {
	return path.join(getPolarishConfigDir(), "bridge.json");
}
