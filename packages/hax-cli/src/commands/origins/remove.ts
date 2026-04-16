import { Args, Command } from "@oclif/core";
import { removeAllowedOrigin } from "../../lib/bridge-config.js";

/**
 * This removes one browser origin from the local bridge allowlist.
 */
export default class OriginsRemove extends Command {
	static override id = "origins remove";

	static override description = "Remove one allowed browser origin";

	static override args = {
		origin: Args.string({
			description: "Origin to remove, for example https://app.example.com",
			required: true,
		}),
	};

	async run(): Promise<void> {
		const { args } = await this.parse(OriginsRemove);
		const config = await removeAllowedOrigin(args.origin);
		this.log(`Removed origin: ${args.origin}`);
		this.log(
			`Allowed origins: ${
				config.security.allowedOrigins.length > 0
					? config.security.allowedOrigins.join(", ")
					: "(localhost only)"
			}`,
		);
	}
}
