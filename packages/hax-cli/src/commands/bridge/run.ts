import { Command } from "@oclif/core";
import { readBridgeConfig } from "../../lib/bridge-config.js";

type BridgeModule = typeof import("@polarish/bridge");

/**
 * This loads the local bridge runtime.
 * It tries the workspace package first (normal dev/prod), then falls back to the
 * monorepo-local built artifact so the CLI still works when workspace linking is missing.
 */
async function loadBridgeModule(): Promise<BridgeModule> {
	try {
		return await import("@polarish/bridge");
	} catch {
		// Fallback path when `node_modules/@polarish/bridge` symlinks aren't present.
		return await import("../../../../bridge/dist/index.js");
	}
}

/**
 * This starts the local bridge server in the foreground.
 */
export default class BridgeRun extends Command {
	static override id = "bridge run";

	static override description = "Run the local bridge in the foreground";

	async run(): Promise<void> {
		const config = await readBridgeConfig();
		const { startBridgeServer } = await loadBridgeModule();
		startBridgeServer(config);
		this.log(`Bridge running on http://127.0.0.1:${config.server.port}`);
		await new Promise<void>(() => {
			// keep the command alive while the server is running
		});
	}
}
