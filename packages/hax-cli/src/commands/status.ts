import { Command, Flags } from "@oclif/core";
import { readBridgeConfig } from "../lib/bridge-config.js";
import { loadRepoEnv } from "../lib/env.js";
import { getBridgeConfigJsonPath } from "../lib/paths.js";

/**
 * Prints the local bridge config and the origins currently allowed to call it.
 */
export default class Status extends Command {
	static override id = "status";

	static override description = "Show local bridge status";

	static override flags = {
		"no-update-notifier": Flags.boolean({
			description: "Skip checking for newer CLI versions",
			default: false,
		}),
		json: Flags.boolean({
			description: "Print JSON",
			default: false,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Status);
		if (flags["no-update-notifier"]) {
			process.env.NO_UPDATE_NOTIFIER = "1";
		}

		loadRepoEnv();
		const config = await readBridgeConfig();
		const filePath = getBridgeConfigJsonPath();

		if (flags.json) {
			this.log(JSON.stringify({ config, filePath }, null, 2));
			return;
		}

		this.log(`Bridge config: ${filePath}`);
		this.log(`Port: ${config.server.port}`);
		this.log(
			`Allowed origins: ${
				config.security.allowedOrigins.length > 0
					? config.security.allowedOrigins.join(", ")
					: "(localhost only)"
			}`,
		);
	}
}
