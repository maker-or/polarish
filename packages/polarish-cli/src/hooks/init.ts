import type { Hook } from "@oclif/core";
import { isAutostartConfigured, setupAutostart } from "../lib/autostart.js";

/**
 * This returns true when user ran help/version style commands.
 */
function isHelpOrVersionInvocation(argv: string[]): boolean {
	const firstArg = argv[0];
	return ["--help", "-h", "help", "--version", "-v", "version"].includes(
		firstArg,
	);
}

/**
 * Runs before any command.
 * Ensures bridge autostart is configured when supported on the OS.
 * Interactive provider setup runs only from the `connect` command (including bare `polarish`).
 */
const hook: Hook<"init"> = async function init() {
	const argv = process.argv.slice(2);
	if (isHelpOrVersionInvocation(argv)) {
		return;
	}

	if (!(await isAutostartConfigured())) {
		await setupAutostart();
	}
};

export default hook;
