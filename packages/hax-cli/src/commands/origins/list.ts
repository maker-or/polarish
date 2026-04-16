import { Command, Flags } from "@oclif/core";
import { readBridgeConfig } from "../../lib/bridge-config.js";

/**
 * This prints the origins currently allowed to call the local bridge.
 */
export default class OriginsList extends Command {
	static override id = "origins list";

	static override description = "List allowed browser origins";

	static override flags = {
		json: Flags.boolean({
			description: "Print JSON",
			default: false,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(OriginsList);
		const config = await readBridgeConfig();

		if (flags.json) {
			this.log(JSON.stringify(config.security.allowedOrigins, null, 2));
			return;
		}

		if (config.security.allowedOrigins.length === 0) {
			this.log("No public origins configured. Localhost origins stay allowed.");
			return;
		}

		for (const origin of config.security.allowedOrigins) {
			this.log(origin);
		}
	}
}
