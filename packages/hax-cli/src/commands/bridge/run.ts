import { Command } from "@oclif/core";
import { startBridgeServer } from "../../bridge/index.js";
import { readBridgeConfig } from "../../lib/bridge-config.js";

/**
 * This starts the local bridge server in the foreground.
 * Bridge runtime lives in `src/bridge/` so `@polarish/cli` ships one npm package (no separate `@polarish/bridge` install).
 */
export default class BridgeRun extends Command {
	static override id = "bridge run";

	static override description = "Run the local bridge in the foreground";

	async run(): Promise<void> {
		const config = await readBridgeConfig();
		startBridgeServer(config);
		this.log(`Bridge running on http://127.0.0.1:${config.server.port}`);
		await new Promise<void>(() => {
			// keep the command alive while the server is running
		});
	}
}
