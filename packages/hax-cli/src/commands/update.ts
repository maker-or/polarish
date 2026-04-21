import { spawn } from "node:child_process";
import { Command, Flags } from "@oclif/core";
import { PACKAGE_NAME } from "../lib/package-info.js";

/**
 * Attempts to upgrade the globally installed CLI using bun or npm, or prints manual commands.
 */
export default class Update extends Command {
	static override id = "update";

	static override description =
		"Update the globally installed polarish CLI (bun or npm)";

	static override flags = {
		"no-update-notifier": Flags.boolean({
			description: "Skip checking for newer CLI versions",
			default: false,
		}),
		dry: Flags.boolean({
			description: "Only print commands, do not run installers",
			default: false,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Update);
		if (flags["no-update-notifier"]) {
			process.env.NO_UPDATE_NOTIFIER = "1";
		}

		const pkg = PACKAGE_NAME;
		const bunCmd = `bun add -g ${pkg}@latest`;
		const npmCmd = `npm install -g ${pkg}@latest`;

		if (flags.dry) {
			this.log(`Dry run. You would run one of:\n  ${bunCmd}\n  ${npmCmd}`);
			return;
		}

		const trySpawn = (
			cmd: string,
			args: string[],
		): Promise<{ code: number | null }> =>
			new Promise((resolve) => {
				const child = spawn(cmd, args, {
					stdio: "inherit",
					shell: false,
				});
				child.on("error", () => resolve({ code: null }));
				child.on("close", (code) => resolve({ code }));
			});

		this.log("Trying: bun add -g …");
		const bunResult = await trySpawn("bun", ["add", "-g", `${pkg}@latest`]);
		if (bunResult.code === 0) {
			this.log("Updated with bun.");
			return;
		}

		this.log("Trying: npm install -g …");
		const npmResult = await trySpawn("npm", ["install", "-g", `${pkg}@latest`]);
		if (npmResult.code === 0) {
			this.log("Updated with npm.");
			return;
		}

		this.log(
			`Could not run bun or npm automatically. Install a newer version with:\n  ${bunCmd}\n  ${npmCmd}`,
		);
	}
}
