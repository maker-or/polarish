import { spawn } from "node:child_process";
import inquirer from "inquirer";
import { createSpinner } from "nanospinner";

/**
 * This is one provider option shown in setup prompt.
 */
export type ProviderHarnessId = "chatgpt-codex" | "anthropic-claude-code";

/**
 * This is runtime state for one provider on current machine.
 */
export type ProviderHarnessState = {
	authenticated: boolean;
	installed: boolean;
};

/**
 * This is shape of a command execution result.
 */
type CommandResult = {
	code: number | null;
	errorCode?: string;
	ok: boolean;
	stderr: string;
	stdout: string;
};

/**
 * This is setup result for one provider.
 */
type ProviderSetupResult = {
	error?: string;
	ok: boolean;
	provider: ProviderHarnessId;
};

/**
 * This runs a command and captures stdout/stderr without opening interactive TTY.
 */
async function runCommand(
	command: string,
	args: string[],
): Promise<CommandResult> {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let errorCode: string | undefined;

		child.stdout.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});

		child.on("error", (error: NodeJS.ErrnoException) => {
			errorCode = error.code;
		});

		child.on("close", (code) => {
			resolve({
				code,
				errorCode,
				ok: code === 0,
				stderr: stderr.trim(),
				stdout: stdout.trim(),
			});
		});
	});
}

/**
 * This runs a command in interactive mode so user can complete login flows.
 */
function runInteractive(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			shell: false,
			stdio: "inherit",
		});

		child.on("error", (error) => {
			reject(error);
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`Command ${command} failed with exit code ${code}`));
		});
	});
}

/**
 * This runs a shell command in interactive mode.
 */
function runInteractiveShell(command: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, {
			shell: true,
			stdio: "inherit",
		});

		child.on("error", (error) => reject(error));
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`Shell command failed with exit code ${code}`));
		});
	});
}

/**
 * This returns true when command result means binary was not found.
 */
function isMissingBinary(result: CommandResult): boolean {
	return (
		result.errorCode === "ENOENT" || result.code === 127 || result.code === 9009
	);
}

/**
 * This checks Codex installation and auth state by running `codex login status`.
 */
async function getCodexState(): Promise<ProviderHarnessState> {
	const result = await runCommand("codex", ["login", "status"]);
	if (isMissingBinary(result)) {
		return { authenticated: false, installed: false };
	}

	const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
	const notLoggedIn =
		combined.includes("not logged in") ||
		combined.includes("not authenticated") ||
		combined.includes("login required");

	return {
		authenticated: result.ok && !notLoggedIn,
		installed: true,
	};
}

/**
 * This checks Claude Code installation with `claude -v` and auth with `claude auth status`.
 */
async function getClaudeState(): Promise<ProviderHarnessState> {
	const version = await runCommand("claude", ["-v"]);
	if (isMissingBinary(version)) {
		return { authenticated: false, installed: false };
	}

	const status = await runCommand("claude", ["auth", "status"]);
	const combined = `${status.stdout}\n${status.stderr}`.toLowerCase();
	const notLoggedIn =
		combined.includes("not logged in") ||
		combined.includes("not authenticated") ||
		combined.includes("login required");

	return {
		authenticated: status.ok && !notLoggedIn,
		installed: true,
	};
}

/**
 * This probes Codex and Claude Code CLI install plus login state without opening interactive installers.
 */
export async function getProviderHarnessStates(): Promise<
	Record<ProviderHarnessId, ProviderHarnessState>
> {
	return {
		"anthropic-claude-code": await getClaudeState(),
		"chatgpt-codex": await getCodexState(),
	};
}

/**
 * This installs Claude Code based on current operating system.
 */
async function installClaudeCode(): Promise<void> {
	if (process.platform !== "win32") {
		await runInteractiveShell("curl -fsSL https://claude.ai/install.sh | bash");
		return;
	}

	try {
		await runInteractive("powershell", [
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-Command",
			"irm https://claude.ai/install.ps1 | iex",
		]);
		return;
	} catch {
		await runInteractive("cmd.exe", [
			"/d",
			"/s",
			"/c",
			"curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd",
		]);
	}
}

/**
 * This installs OpenAI Codex CLI globally.
 */
async function installCodex(): Promise<void> {
	await runInteractive("bun", ["add", "-g", "@openai/codex"]);
}

/**
 * This installs chosen provider if missing, then runs login in same session.
 * It never throws and returns success/failure.
 */
async function setupProvider(
	provider: ProviderHarnessId,
): Promise<ProviderSetupResult> {
	try {
		if (provider === "chatgpt-codex") {
			const before = await getCodexState();
			if (!before.installed) {
				const spinner = createSpinner(
					"Installing ChatGPT Codex CLI...",
				).start();
				try {
					await installCodex();
					spinner.success({ text: "Codex installed." });
				} catch (error) {
					spinner.error({ text: "Codex install failed." });
					throw error;
				}
			}

			if (!before.authenticated || !before.installed) {
				console.log("\nAuthenticate ChatGPT Codex account:");
				await runInteractive("codex", ["login"]);
			}

			const after = await getCodexState();
			if (!after.installed || !after.authenticated) {
				return {
					error:
						"Codex setup incomplete. Install/login did not finish successfully.",
					ok: false,
					provider,
				};
			}

			return { ok: true, provider };
		}

		const before = await getClaudeState();
		if (!before.installed) {
			const spinner = createSpinner(
				"Installing Anthropic Claude Code CLI...",
			).start();
			try {
				await installClaudeCode();
				spinner.success({ text: "Claude Code installed." });
			} catch (error) {
				spinner.error({ text: "Claude Code install failed." });
				throw error;
			}
		}

		if (!before.authenticated || !before.installed) {
			console.log("\nAuthenticate Anthropic Claude Code account:");
			await runInteractive("claude", ["auth", "login"]);
		}

		const after = await getClaudeState();
		if (!after.installed || !after.authenticated) {
			return {
				error:
					"Claude Code setup incomplete. Install/login did not finish successfully.",
				ok: false,
				provider,
			};
		}

		return { ok: true, provider };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			ok: false,
			provider,
		};
	}
}

/**
 * This asks user which subscriptions to connect and supports multi-select.
 * Empty selection is allowed so user can skip setup.
 */
async function promptProviderSelection(
	states: Record<ProviderHarnessId, ProviderHarnessState>,
): Promise<ProviderHarnessId[]> {
	const codexState = states["chatgpt-codex"];
	const claudeState = states["anthropic-claude-code"];

	const { providers } = await inquirer.prompt<{
		providers: ProviderHarnessId[];
	}>([
		{
			choices: [
				{
					checked: !codexState.installed || !codexState.authenticated,
					name: `ChatGPT Codex ${
						codexState.installed
							? codexState.authenticated
								? "(ready)"
								: "(installed, login needed)"
							: "(not installed)"
					}`,
					value: "chatgpt-codex",
				},
				{
					checked: !claudeState.installed || !claudeState.authenticated,
					name: `Anthropic Claude Code ${
						claudeState.installed
							? claudeState.authenticated
								? "(ready)"
								: "(installed, login needed)"
							: "(not installed)"
					}`,
					value: "anthropic-claude-code",
				},
			],
			message: "Connect your subscriptions (optional)",
			name: "providers",
			type: "checkbox",
		},
	]);

	return providers ?? [];
}

/**
 * This checks harness install/auth state and offers one-session setup.
 * Setup is helper only. It never blocks the rest of CLI.
 */
export async function ensureHarnessInstalled(): Promise<void> {
	const states: Record<ProviderHarnessId, ProviderHarnessState> = {
		"anthropic-claude-code": await getClaudeState(),
		"chatgpt-codex": await getCodexState(),
	};

	const allReady = Object.values(states).every(
		(state) => state.installed && state.authenticated,
	);
	if (allReady) {
		return;
	}

	console.log(
		"\nSome providers are not ready. You can skip setup and continue.",
	);

	let selectedProviders: ProviderHarnessId[] = [];
	try {
		selectedProviders = await promptProviderSelection(states);
	} catch {
		console.log("Skipped provider setup.");
		return;
	}

	if (selectedProviders.length === 0) {
		console.log("Skipped provider setup.");
		return;
	}

	const results: ProviderSetupResult[] = [];
	for (const provider of selectedProviders) {
		results.push(await setupProvider(provider));
	}

	const failures = results.filter((result) => !result.ok);
	if (failures.length === 0) {
		console.log("\nProvider setup complete.");
		return;
	}

	console.log("\nProvider setup finished with warnings:");
	for (const failure of failures) {
		console.log(`- ${failure.provider}: ${failure.error ?? "Unknown error"}`);
	}
}
