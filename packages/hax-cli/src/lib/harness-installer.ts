import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import inquirer from "inquirer";
import ora from "ora";

const execAsync = promisify(exec);

/**
 * Checks if a command exists in the system PATH.
 * @param command - The command to check (e.g. 'codex' or 'cloudcode')
 * @returns boolean indicating if command exists
 */
async function commandExists(command: string): Promise<boolean> {
	try {
		await execAsync(`command -v ${command}`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Runs a shell command and streams output to terminal.
 * @param command - The command to run
 * @param args - Arguments array
 * @returns Promise that resolves when command exits with code 0
 */
function runCommandInteractive(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "inherit", shell: true });
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Command ${command} failed with exit code ${code}`));
			}
		});
	});
}

/**
 * Prompts the user to install a harness if none are found.
 * Installs the chosen harness and runs its authentication flow.
 */
export async function ensureHarnessInstalled(): Promise<void> {
	const hasCodex = await commandExists("codex");
	const hasCloudCode = await commandExists("cloudcode");

	if (hasCodex || hasCloudCode) {
		return;
	}

	console.log(
		"\nNo AI harness found. Polarish requires either Codex or Cloud Code.",
	);

	const { harness } = await inquirer.prompt([
		{
			type: "list",
			name: "harness",
			message: "Which harness would you like to install?",
			choices: [
				{ name: "Codex", value: "codex" },
				{ name: "Cloud Code", value: "cloudcode" },
			],
		},
	]);

	const spinner = ora(`Installing ${harness}...`).start();

	try {
		if (harness === "codex") {
			// Example install command, replace with actual
			await execAsync("npm install -g @codex/cli"); // TODO: correct command
			spinner.succeed("Codex installed successfully.");
			console.log("\nPlease authenticate with Codex:");
			await runCommandInteractive("codex", ["login"]);
		} else {
			// Example install command, replace with actual
			await execAsync("npm install -g @cloudcode/cli"); // TODO: correct command
			spinner.succeed("Cloud Code installed successfully.");
			console.log("\nPlease authenticate with Cloud Code:");
			await runCommandInteractive("cloudcode", ["login"]);
		}
	} catch (error) {
		spinner.fail(`Failed to install ${harness}.`);
		console.error(error);
		process.exit(1);
	}
}
