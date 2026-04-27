/**
 * This builds the HTTP headers that every bridge request sends.
 * origin is the app origin that Node or Bun callers present to the bridge,
 * and headers are extra request headers for low-level transport overrides.
 */
export function buildBridgeHeaders(
	origin?: string,
	headers?: Record<string, string>,
): Headers {
	const result = new Headers(headers);
	const trimmedOrigin = origin?.trim();

	if (trimmedOrigin) {
		result.set("origin", trimmedOrigin);
	}

	result.set("content-type", "application/json");
	return result;
}
