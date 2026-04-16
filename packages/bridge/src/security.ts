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
