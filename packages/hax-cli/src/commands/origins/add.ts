import { Args, Command } from "@oclif/core";
import { addAllowedOrigin } from "../../lib/bridge-config.js";

/**
 * This adds one browser origin to the local bridge allowlist.
 */
export default class OriginsAdd extends Command {
	static override id = "origins add";

	static override description = "Add one allowed browser origin";

	static override args = {
		origin: Args.string({
			description: "Origin to allow, for example https://app.example.com",
			required: true,
		}),
	};

	async run(): Promise<void> {
		const { args } = await this.parse(OriginsAdd);
		const config = await addAllowedOrigin(args.origin);
		this.log(`Added origin: ${args.origin}`);
		this.log(
			`Allowed origins: ${
				config.security.allowedOrigins.length > 0
					? config.security.allowedOrigins.join(", ")
					: "(localhost only)"
			}`,
		);
	}
}
