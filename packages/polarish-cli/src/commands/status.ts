import { Command, Flags } from "@oclif/core";
import { IMPLICIT_LOOPBACK_BROWSER_ORIGIN_HOSTS } from "../bridge/security.js";
import type { BridgeConfig } from "../lib/bridge-config.js";
import { readBridgeConfig } from "../lib/bridge-config.js";
import {
	type ProviderHarnessState,
	getProviderHarnessStates,
} from "../lib/harness-installer.js";
import { getBridgeConfigJsonPath } from "../lib/paths.js";

/**
 * Machine-readable `polarish status --json` payload: bridge config, provider probes, and origin policy.
 */
export type StatusJsonOutput = {
	config: BridgeConfig;
	filePath: string;
	origins: {
		configuredOrigins: string[];
		implicitLoopbackBrowserHosts: readonly string[];
	};
	providers: {
		"anthropic-claude-code": ProviderHarnessState;
		"chatgpt-codex": ProviderHarnessState;
	};
};

/**
 * This maps probe state to a short human-readable connection summary for one CLI provider.
 */
function describeProvider(label: string, state: ProviderHarnessState): string {
	if (!state.installed) {
		return `${label}: not installed`;
	}
	if (!state.authenticated) {
		return `${label}: installed (login required)`;
	}
	return `${label}: connected`;
}

/**
 * Prints bridge listen settings, effective browser-origin policy, and Codex / Claude Code readiness.
 */
export default class Status extends Command {
	static override id = "status";

	static override description =
		"Show bridge settings, allowed origins, and connected providers";

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

		const config = await readBridgeConfig();
		const filePath = getBridgeConfigJsonPath();
		const configuredOrigins = [...config.security.allowedOrigins];
		const providers = await getProviderHarnessStates();

		const payload: StatusJsonOutput = {
			config,
			filePath,
			origins: {
				configuredOrigins,
				implicitLoopbackBrowserHosts: IMPLICIT_LOOPBACK_BROWSER_ORIGIN_HOSTS,
			},
			providers,
		};

		if (flags.json) {
			this.log(JSON.stringify(payload, null, 2));
			return;
		}

		this.log(`Bridge config: ${filePath}`);
		this.log(`Port: ${config.server.port}`);

		this.log("");
		this.log(
			"Browser origins always allowed (loopback — any port, typical http/https):",
		);
		for (const host of IMPLICIT_LOOPBACK_BROWSER_ORIGIN_HOSTS) {
			this.log(`  · ${host}`);
		}

		this.log("");
		this.log("Additionally allowed (from bridge.json):");
		if (configuredOrigins.length === 0) {
			this.log("  (none)");
		} else {
			for (const origin of configuredOrigins) {
				this.log(`  · ${origin}`);
			}
		}

		this.log("");
		this.log("Providers:");
		this.log(
			`  ${describeProvider("ChatGPT Codex", providers["chatgpt-codex"])}`,
		);
		this.log(
			`  ${describeProvider("Anthropic Claude Code", providers["anthropic-claude-code"])}`,
		);
	}
}
