/**
 * This writes one debug log for the AI tool flow.
 * Pass small, useful data so the tool path stays easy to trace.
 */
export function aiDebugLog(
	scope: string,
	message: string,
	data?: unknown,
): void {
	if (data === undefined) {
		console.log(`[polarish/ai:${scope}] ${message}`);
		return;
	}

	console.log(`[polarish/ai:${scope}] ${message}`, data);
}
