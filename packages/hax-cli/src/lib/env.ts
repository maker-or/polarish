import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnvFile } from "dotenv";

/**
 * Loads `.env` and `.env.local` from the monorepo root (walks up from this file until `convex/` exists).
 * Call once before reading `process.env` for web URL and Convex.
 */
export function loadRepoEnv(): void {
	let dir = path.dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 12; i++) {
		const envPath = path.join(dir, ".env");
		const localPath = path.join(dir, ".env.local");
		if (existsSync(envPath)) {
			loadEnvFile({ path: envPath });
		}
		if (existsSync(localPath)) {
			loadEnvFile({ path: localPath, override: true });
		}
		if (existsSync(path.join(dir, "convex"))) {
			break;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}
}

/**
 * Returns the OAuth redirect base URL env name used by the web app (`NEXT_PUBLIC_WORKOS_REDIRECT_URI`).
 * The origin of this URL is the web app base used for `/desktop-auth/*` routes.
 */
export function getWebBaseUrl(): URL {
	const configuredCallbackUrl = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
	if (!configuredCallbackUrl) {
		throw new Error(
			"NEXT_PUBLIC_WORKOS_REDIRECT_URI is not set. Configure it in the repo root .env.",
		);
	}
	return new URL(configuredCallbackUrl);
}

/**
 * Local HTTP server port for ChatGPT and Hax OAuth callbacks (default `1455`).
 */
export function getCallbackPort(): number {
	const raw = process.env.HAX_DESKTOP_CALLBACK_PORT ?? "1455";
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error("HAX_DESKTOP_CALLBACK_PORT must be a positive integer.");
	}
	return n;
}

/**
 * Convex deployment URL from `VITE_CONVEX_URL` or `NEXT_PUBLIC_CONVEX_URL`.
 */
export function getConvexUrl(): string {
	const convexUrl =
		process.env.VITE_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!convexUrl) {
		throw new Error(
			"VITE_CONVEX_URL or NEXT_PUBLIC_CONVEX_URL must be set for Convex mutations.",
		);
	}
	return convexUrl;
}

/**
 * Convex HTTP site URL from `VITE_CONVEX_SITE_URL` or `NEXT_PUBLIC_CONVEX_SITE_URL`.
 */
export function getConvexSiteUrl(): URL {
	const convexSiteUrl =
		process.env.VITE_CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
	if (!convexSiteUrl) {
		throw new Error(
			"VITE_CONVEX_SITE_URL or NEXT_PUBLIC_CONVEX_SITE_URL must be set for Convex HTTP routes.",
		);
	}
	return new URL(convexSiteUrl);
}
