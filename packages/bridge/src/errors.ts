/**
 * This is the error payload that the bridge returns to clients.
 */
export type BridgeErrorPayload = {
	error: {
		code: string;
		message: string;
		detail?: string;
		suggestedAction?: string;
		metadata?: Record<string, unknown>;
	};
};

/**
 * This is the bridge error object used internally before writing an HTTP response.
 */
export class BridgeError extends Error {
	readonly status: number;
	readonly payload: BridgeErrorPayload;

	constructor(args: {
		status: number;
		code: string;
		message: string;
		detail?: string;
		suggestedAction?: string;
		metadata?: Record<string, unknown>;
	}) {
		super(args.message);
		this.name = "BridgeError";
		this.status = args.status;
		this.payload = {
			error: {
				code: args.code,
				message: args.message,
				...(args.detail ? { detail: args.detail } : {}),
				...(args.suggestedAction
					? { suggestedAction: args.suggestedAction }
					: {}),
				...(args.metadata ? { metadata: args.metadata } : {}),
			},
		};
	}
}

/**
 * This turns any thrown value into a response-ready bridge error.
 */
export function asBridgeError(error: unknown): BridgeError {
	if (error instanceof BridgeError) {
		return error;
	}

	const message = error instanceof Error ? error.message : String(error);
	return new BridgeError({
		status: 500,
		code: "internal_error",
		message: "The bridge failed to process the request.",
		detail: message,
	});
}

/**
 * This builds a JSON error response with the bridge payload shape.
 */
export function bridgeErrorResponse(error: unknown): Response {
	const bridgeError = asBridgeError(error);
	return Response.json(bridgeError.payload, {
		status: bridgeError.status,
		headers: {
			"content-type": "application/json; charset=utf-8",
		},
	});
}
