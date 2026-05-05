/**
 * Hostnames that are always allowed as browser `Origin` values without listing them in `bridge.json`.
 * Keep this aligned with {@link isLocalhostOrigin} logic.
 */
export const IMPLICIT_LOOPBACK_BROWSER_ORIGIN_HOSTS: readonly string[] = [
	"localhost",
	"127.0.0.1",
	"[::1]",
	"::1",
];

/**
 * This tells us if an origin points at a localhost browser context.
 */
export function isLocalhostOrigin(origin: string): boolean {
	try {
		const url = new URL(origin);
		return (
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "[::1]" ||
			url.hostname === "::1"
		);
	} catch {
		return false;
	}
}

/**
 * This checks if a browser origin is allowed to call the bridge.
 */
export function isAllowedOrigin(
	origin: string | null,
	allowedOrigins: readonly string[],
): boolean {
	if (!origin) {
		return false;
	}

	if (isLocalhostOrigin(origin)) {
		return true;
	}

	return allowedOrigins.includes(origin);
}

/** Loopback http(s) only — avoids using the bridge as an SSRF relay for `toolExecution.callbackUrl`. */
export function isLocalhostToolCallbackUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return false;
		}
		if (url.username !== "" || url.password !== "") {
			return false;
		}
		const host = url.hostname.toLowerCase();
		return (
			host === "127.0.0.1" ||
			host === "localhost" ||
			host === "[::1]" ||
			host === "::1"
		);
	} catch {
		return false;
	}
}
