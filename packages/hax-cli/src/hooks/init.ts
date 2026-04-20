import type { Hook } from "@oclif/core";
import { isAutostartConfigured, setupAutostart } from "../lib/autostart.js";
import { ensureHarnessInstalled } from "../lib/harness-installer.js";

/**
 * Runs before any command.
 * Checks for required harness dependencies (Codex/Cloud Code).
 */
const hook: Hook<"init"> = async function init() {
	// Skip dependency check if the user is running help or version
	if (
		["--help", "-h", "help", "--version", "-v", "version"].includes(
			process.argv[2],
		)
	) {
		return;
	}

	await ensureHarnessInstalled();

	if (!(await isAutostartConfigured())) {
		await setupAutostart();
	}
};

export default hook;
