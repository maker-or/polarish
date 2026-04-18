import type {
	AppRequestShapeType,
	UnifiedStreamEventPayload,
} from "./contracts.js";

/**
 * This is the common runtime context that each bridge provider adapter receives.
 */
export type ExecuteContext = {
	signal?: AbortSignal;
	transport: "sse";
};

/**
 * This is the standard availability result for local provider harnesses.
 */
export type AdapterAvailability = {
	installed: boolean;
	authenticated: boolean;
	detail?: string;
	version?: string;
};

/**
 * This checks whether the value is a plain object record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * This reads one numeric field from an unknown record.
 */
export function getNumber(
	value: Record<string, unknown>,
	key: string,
): number | undefined {
	const candidate = value[key];
	return typeof candidate === "number" ? candidate : undefined;
}

/**
 * This reads one string field from an unknown record.
 */
export function getString(
	value: Record<string, unknown>,
	key: string,
): string | undefined {
	const candidate = value[key];
	return typeof candidate === "string" ? candidate : undefined;
}

/**
 * This turns the full request history into one transcript string for harnesses
 * that only accept a single prompt on stdin or argv.
 */
export function buildTranscript(request: AppRequestShapeType): string {
	const lines: string[] = [];
	lines.push("Conversation:");
	for (const message of request.messages) {
		const roleLabel =
			message.role === "tool"
				? `Tool ${message.toolName}`
				: message.role.charAt(0).toUpperCase() + message.role.slice(1);
		lines.push(`${roleLabel}: ${messageToText(message)}`);
	}
	return lines.join("\n\n");
}

/**
 * This turns one unified history message into text for transcript-only harnesses.
 */
export function messageToText(
	message: AppRequestShapeType["messages"][number],
): string {
	if (typeof message.content === "string") {
		return message.content;
	}

	if (message.role === "assistant") {
		return message.content
			.map((part) => {
				if (part.type === "text") {
					return part.text;
				}
				if (part.type === "thinking") {
					return `[thinking] ${part.thinking}`;
				}
				return `[toolcall ${part.name}] ${JSON.stringify(part.arguments)}`;
			})
			.join("\n");
	}

	return message.content
		.map((part) => {
			if (part.type === "text") {
				return part.text;
			}
			return `[attachment ${part.kind}]`;
		})
		.join("\n");
}

/**
 * This creates the async event queue used by bridge adapters that stream unified events.
 */
export function createEventQueue() {
	const events: UnifiedStreamEventPayload[] = [];
	const waiters: Array<{
		reject: (reason?: unknown) => void;
		resolve: (value: IteratorResult<UnifiedStreamEventPayload>) => void;
	}> = [];
	let closed = false;
	let failure: unknown;

	return {
		events: {
			[Symbol.asyncIterator](): AsyncIterator<UnifiedStreamEventPayload> {
				return {
					next(): Promise<IteratorResult<UnifiedStreamEventPayload>> {
						if (failure) {
							return Promise.reject(failure);
						}
						if (events.length > 0) {
							return Promise.resolve({
								value: events.shift() as UnifiedStreamEventPayload,
								done: false,
							});
						}
						if (closed) {
							return Promise.resolve({
								value: undefined,
								done: true,
							});
						}
						return new Promise((resolve, reject) => {
							waiters.push({ resolve, reject });
						});
					},
				};
			},
		},
		close(): void {
			closed = true;
			while (waiters.length > 0) {
				waiters.shift()?.resolve({ value: undefined, done: true });
			}
		},
		push(event: UnifiedStreamEventPayload): void {
			const waiter = waiters.shift();
			if (waiter) {
				waiter.resolve({ value: event, done: false });
				return;
			}
			events.push(event);
		},
		pushError(error: unknown): void {
			failure = error;
			while (waiters.length > 0) {
				waiters.shift()?.reject(error);
			}
		},
	};
}
