import { exec } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Checks if the OS autostart service is already configured for the bridge.
 * Returns true if the service file exists, false otherwise.
 */
export async function isAutostartConfigured(): Promise<boolean> {
	const platform = os.platform();
	try {
		if (platform === "darwin") {
			const plistPath = path.join(
				os.homedir(),
				"Library",
				"LaunchAgents",
				"com.polarish.bridge.plist",
			);
			await fs.access(plistPath);
			return true;
		}
		if (platform === "linux") {
			const servicePath = path.join(
				os.homedir(),
				".config",
				"systemd",
				"user",
				"polarish-bridge.service",
			);
			await fs.access(servicePath);
			return true;
		}
	} catch {
		return false;
	}
	return false;
}

/**
 * Ensures the bridge starts automatically on OS boot.
 */
export async function setupAutostart(): Promise<void> {
	const platform = os.platform();

	try {
		if (platform === "darwin") {
			await setupLaunchd();
		} else if (platform === "linux") {
			await setupSystemd();
		} else {
			console.log(
				`Autostart not supported yet on ${platform}. Please start bridge manually.`,
			);
		}
	} catch (error) {
		console.error("Failed to setup autostart:", error);
	}
}

/**
 * Creates and registers a launchd plist on macOS to start the bridge on boot.
 */
async function setupLaunchd(): Promise<void> {
	const plistName = "com.polarish.bridge.plist";
	const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
	const plistPath = path.join(launchAgentsDir, plistName);

	// Ensure the directory exists
	await fs.mkdir(launchAgentsDir, { recursive: true });

	const execPath = process.execPath; // Usually node
	const binPath = path.resolve(process.argv[1]); // The CLI bin script

	const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.polarish.bridge</string>
	<key>ProgramArguments</key>
	<array>
		<string>${execPath}</string>
		<string>${binPath}</string>
		<string>bridge</string>
		<string>run</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${path.join(os.homedir(), ".polarish", "bridge.log")}</string>
	<key>StandardErrorPath</key>
	<string>${path.join(os.homedir(), ".polarish", "bridge.err")}</string>
</dict>
</plist>
`;

	await fs.mkdir(path.join(os.homedir(), ".polarish"), { recursive: true });
	await fs.writeFile(plistPath, plistContent, "utf-8");

	// Try to load the plist
	try {
		await execAsync(`launchctl unload ${plistPath}`);
	} catch {
		// Ignore if not loaded
	}
	await execAsync(`launchctl load ${plistPath}`);
	console.log("Enabled auto-start for macOS via launchd.");
}

/**
 * Creates and registers a systemd user service on Linux to start the bridge on boot.
 */
async function setupSystemd(): Promise<void> {
	const serviceName = "polarish-bridge.service";
	const systemdDir = path.join(os.homedir(), ".config", "systemd", "user");
	const servicePath = path.join(systemdDir, serviceName);

	await fs.mkdir(systemdDir, { recursive: true });

	const execPath = process.execPath;
	const binPath = path.resolve(process.argv[1]);

	const serviceContent = `[Unit]
Description=Polarish Bridge Service
After=network.target

[Service]
ExecStart=${execPath} ${binPath} bridge run
Restart=always
RestartSec=3
StandardOutput=append:%h/.polarish/bridge.log
StandardError=append:%h/.polarish/bridge.err

[Install]
WantedBy=default.target
`;

	await fs.mkdir(path.join(os.homedir(), ".polarish"), { recursive: true });
	await fs.writeFile(servicePath, serviceContent, "utf-8");

	await execAsync("systemctl --user daemon-reload");
	await execAsync(`systemctl --user enable ${serviceName}`);
	try {
		await execAsync(`systemctl --user start ${serviceName}`);
	} catch {
		// Might already be running
	}
	console.log("Enabled auto-start for Linux via systemd.");
}
