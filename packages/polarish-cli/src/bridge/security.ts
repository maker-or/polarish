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
 * This splits the HTTP Origin header value into separate origin URLs.
 * Browsers send one origin; Node callers may join several with spaces (see `@polarish/ai` client headers).
 */
export function tokenizeOriginHeader(origin: string): string[] {
	return origin
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
}

/**
 * This checks one origin URL token against loopback rules and the configured allowlist.
 */
function isSingleOriginAllowed(
	originToken: string,
	allowedOrigins: readonly string[],
): boolean {
	if (isLocalhostOrigin(originToken)) {
		return true;
	}

	return allowedOrigins.includes(originToken);
}

/**
 * This checks if a browser Origin header is allowed to call the bridge.
 * When the header lists several origins separated by whitespace (SDK convention),
 * the request is allowed if **any** token passes alone (loopback rule or allowlist).
 */
export function isAllowedOrigin(
	origin: string | null,
	allowedOrigins: readonly string[],
): boolean {
	if (!origin) {
		return false;
	}

	const tokens = tokenizeOriginHeader(origin);
	if (tokens.length === 0) {
		return false;
	}

	return tokens.some((token) => isSingleOriginAllowed(token, allowedOrigins));
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
