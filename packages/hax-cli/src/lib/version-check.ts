import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import { getPolarishConfigDir } from "./paths.js";

const CACHE_FILE = "version-check.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

type VersionCache = {
	lastCheckEpochMs: number;
	lastLatest: string | null;
};

function getCachePath() {
	return path.join(getPolarishConfigDir(), CACHE_FILE);
}

async function readCache(): Promise<VersionCache | null> {
	try {
		const raw = await readFile(getCachePath(), "utf8");
		return JSON.parse(raw) as VersionCache;
	} catch {
		return null;
	}
}

async function writeCache(cache: VersionCache) {
	await mkdir(getPolarishConfigDir(), { recursive: true, mode: 0o700 });
	await writeFile(getCachePath(), JSON.stringify(cache, null, 2), {
		encoding: "utf8",
		mode: 0o600,
	});
}

/**
 * Returns true when update notifications should be skipped (CI or explicit opt-out).
 */
export function shouldSkipUpdateCheck(): boolean {
	if (process.env.CI) {
		return true;
	}
	if (process.env.NO_UPDATE_NOTIFIER === "1") {
		return true;
	}
	return false;
}

/**
 * Fetches the latest version from the npm registry for the given package name.
 */
export async function fetchLatestVersionFromNpm(
	packageName: string,
): Promise<string | null> {
	const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
	const response = await fetch(url, {
		headers: { accept: "application/json" },
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as { version?: string };
	return typeof body.version === "string" ? body.version : null;
}

/**
 * Compares current and latest semver; prints a short stderr message when an upgrade exists.
 */
export async function maybePrintUpdateNotice(options: {
	currentVersion: string;
	packageName: string;
}): Promise<void> {
	if (shouldSkipUpdateCheck()) {
		return;
	}

	const now = Date.now();
	const cache = await readCache();
	if (
		cache &&
		now - cache.lastCheckEpochMs < CHECK_INTERVAL_MS &&
		cache.lastLatest
	) {
		if (semver.gt(cache.lastLatest, options.currentVersion)) {
			process.stderr.write(
				`\nA newer version of ${options.packageName} is available: ${cache.lastLatest} (you have ${options.currentVersion}). Run: polarish update\n\n`,
			);
		}
		return;
	}

	let latest: string | null = null;
	try {
		latest = await fetchLatestVersionFromNpm(options.packageName);
	} catch {
		return;
	}

	await writeCache({
		lastCheckEpochMs: now,
		lastLatest: latest,
	});

	if (latest && semver.gt(latest, options.currentVersion)) {
		process.stderr.write(
			`\nA newer version of ${options.packageName} is available: ${latest} (you have ${options.currentVersion}). Run: polarish update\n\n`,
		);
	}
}
