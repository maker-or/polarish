/**
 * This builds the HTTP headers that every bridge request sends.
 * origin is the app origin that Node or Bun callers present to the bridge,
 * and headers are extra request headers for low-level transport overrides.
 *
 * @param origin - The app origin(s) to send in the request.
 * @param headers - Optional extra headers to include.
 * @returns A Headers object with the origin and content-type set.
 */
export function buildBridgeHeaders(
	origin?: string | string[],
	headers?: Record<string, string>,
): Headers {
	const result = new Headers(headers);
	const normalizedOrigin = Array.isArray(origin)
		? origin.map((o) => o.trim()).join(" ")
		: origin?.trim();

	if (normalizedOrigin) {
		result.set("origin", normalizedOrigin);
	}

	result.set("content-type", "application/json");
	return result;
}
