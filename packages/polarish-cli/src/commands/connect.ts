import { Command } from "@oclif/core";
import { ensureHarnessInstalled } from "../lib/harness-installer.js";

/**
 * This runs the interactive flow to install and authenticate ChatGPT Codex and/or Claude Code.
 * Bare `polarish` with no arguments resolves to this command.
 */
export default class Connect extends Command {
	static override id = "connect";

	static override description =
		"Connect your AI subscriptions (Codex and Claude Code, interactive)";

	async run(): Promise<void> {
		await ensureHarnessInstalled();
	}
}
