import { Effect } from "effect";
import type { appRequestShape } from "../providers/openai-codex/types.ts";
import type {
	CreateClientOptions,
	SessionTokens,
	UnifiedGenerateResult,
	UnifiedResponse,
	UnifiedResponseStreamingResult,
	UnifiedStreamEventType,
} from "../types.ts";
import { generate } from "./generate.ts";
import { refreshAccessToken as refreshTokens } from "./refresh-access-token.ts";

/**
 * This is the AI client you get from `create()`.
 * `generate` expects the OpenAI Codex app request shape (including `model`), not the generic `requestShape` helper.
 */
export type Client = {
	generate(request: appRequestShape): Promise<UnifiedGenerateResult>;
};

type SessionUpdateHandlers = {
	setAccessToken: (value: string) => void;
	setRefreshToken: (value: string) => void;
	onSessionTokens:
		| ((tokens: SessionTokens) => void | Promise<void>)
		| undefined;
};

const DEFAULT_BASE_URL = "https://your-default-polaris-url";
const MACHINE_ENDPOINT_PATH = "/api/v1/chat/completions";

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function resolveEndpoint(baseUrl?: string): string {
	const resolvedBaseUrl = baseUrl?.trim() || DEFAULT_BASE_URL;
	return new URL(
		MACHINE_ENDPOINT_PATH,
		ensureTrailingSlash(resolvedBaseUrl),
	).toString();
}

/**
 * This stores fresh tokens in memory and lets the caller persist them.
 */
async function applySessionTokens(
	tokens: SessionTokens | undefined,
	update: SessionUpdateHandlers,
): Promise<void> {
	if (!tokens) {
		return;
	}

	update.setAccessToken(tokens.accessToken);
	update.setRefreshToken(tokens.refreshToken);
	await update.onSessionTokens?.(tokens);
}

/**
 * This wraps stream handles so rotated tokens are applied on `done` and `final()`.
 */
function withSessionTracking(
	result: UnifiedResponseStreamingResult,
	update: SessionUpdateHandlers,
): UnifiedResponseStreamingResult {
	const trackedEvents: AsyncIterable<UnifiedStreamEventType> = {
		async *[Symbol.asyncIterator]() {
			for await (const event of result.events) {
				if (event.type === "done") {
					await applySessionTokens(event.message.sessionTokens, update);
				}
				yield event;
			}
		},
	};

	return {
		...result,
		events: trackedEvents,
		async final(): Promise<UnifiedResponse> {
			const response = await result.final();
			await applySessionTokens(response.sessionTokens, update);
			return response;
		},
	};
}

export function create(options: CreateClientOptions): Client {
	let accessToken = options.accessToken.trim();

	if (!accessToken) {
		throw new Error("create() requires a non-empty `accessToken`.");
	}

	let refreshToken = options.refreshToken.trim();

	const endpoint = resolveEndpoint(options.baseUrl);
	const update = {
		setAccessToken: (value: string) => {
			accessToken = value;
		},
		setRefreshToken: (value: string) => {
			refreshToken = value;
		},
		onSessionTokens: options.onSessionTokens,
	};

	const runGenerate = (
		request: appRequestShape,
	): Promise<UnifiedGenerateResult> =>
		generate(request, {
			endpoint,
			headers: {
				authorization: `Bearer ${accessToken}`,
			},
		});

	const isExpiredAccessTokenError = (error: unknown): boolean => {
		if (!(error instanceof Error)) {
			return false;
		}

		const message = error.message.toLowerCase();
		return (
			message.includes("status 401") ||
			message.includes("invalid_api_key") ||
			message.includes("access token") ||
			message.includes("expired")
		);
	};

	const refreshSession = async (): Promise<void> => {
		if (!refreshToken) {
			throw new Error(
				"Access token expired and no `refreshToken` is available.",
			);
		}

		const refreshed = await Effect.runPromise(
			refreshTokens({
				refreshToken,
				clientId: options.clientId,
				clientSecret: options.clientSecret,
			}),
		);

		await applySessionTokens(
			{
				accessToken: refreshed.accessToken,
				refreshToken: refreshed.refreshToken ?? refreshToken,
			},
			update,
		);
	};

	return {
		async generate(request: appRequestShape): Promise<UnifiedGenerateResult> {
			try {
				const result = await runGenerate(request);
				if (result.stream) {
					return withSessionTracking(result, update);
				}
				await applySessionTokens(result.response.sessionTokens, update);
				return result;
			} catch (error) {
				if (!isExpiredAccessTokenError(error)) {
					throw error;
				}

				await refreshSession();

				if (!accessToken) {
					throw new Error(
						"Access token refresh did not produce a valid token.",
					);
				}

				const retried = await runGenerate(request);
				if (retried.stream) {
					return withSessionTracking(retried, update);
				}
				await applySessionTokens(retried.response.sessionTokens, update);
				return retried;
			}
		},
	};
}
