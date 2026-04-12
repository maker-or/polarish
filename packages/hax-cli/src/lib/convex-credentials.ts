import { getConvexSiteUrl } from "./env.js";
import {
	getValidAccessToken,
	isEndedDesktopSessionError,
	isExpiredAuthError,
	readHaxAuth,
	runHaxLoginFlow,
} from "./hax-session.js";
import { startAuthServer } from "./local-server.js";

type OpenAiIdTokenClaims = {
	chatgpt_account_id: string;
	chatgpt_plan_type: string;
	chatgpt_subscription_active_start: string;
	chatgpt_subscription_active_until: string;
	chatgpt_subscription_last_checked: string;
	chatgpt_user_id: string;
};

/**
 * This type is the shape of the normalized provider credential payload that the CLI sends to the Convex HTTP route.
 */
type CliCredentialStorageInput = {
	provider: "openai-codex";
	provider_subscriptionType: string;
	provider_user_id: string;
	provider_account_id: string;
	provider_sub_active_start: string;
	provider_sub_active_until: string;
	accessToken: string;
	token_id: string | undefined;
	refresh_token: string;
	expiresAt: number;
};

/**
 * This function posts the normalized provider credential payload to Convex over HTTP.
 * This is the shape of the request that we are expecting: provider metadata, access token, refresh token, token id, and expiry.
 */
async function postCredentialToConvexHttp(
	authToken: string,
	input: CliCredentialStorageInput,
) {
	const url = new URL("/cli-credentials", getConvexSiteUrl());
	const response = await fetch(url, {
		method: "POST",
		headers: {
			authorization: `Bearer ${authToken}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(input),
	});

	const result = (await response.json().catch(() => null)) as {
		detail?: string;
		error?: string;
		ok?: boolean;
	} | null;

	if (!response.ok) {
		throw new Error(
			result?.detail ??
				result?.error ??
				`Credential storage failed with status ${response.status}.`,
		);
	}

	return result;
}

/**
 * Persists ChatGPT (OpenAI Codex) tokens in Convex using the current Hax user session.
 */
export async function storeChatGPTCredentialInConvex(input: {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	token_id: string | undefined;
	account: Record<string, unknown> | null;
	provider_subscriptionType: string;
	provider_user_id: string;
	provider_account_id: string;
	provider_sub_active_start: string;
	provider_sub_active_until: string;
}) {
	const payload: CliCredentialStorageInput = {
		provider: "openai-codex",
		provider_subscriptionType: input.provider_subscriptionType,
		provider_user_id: input.provider_user_id,
		provider_account_id: input.provider_account_id,
		provider_sub_active_start: input.provider_sub_active_start,
		provider_sub_active_until: input.provider_sub_active_until,
		accessToken: input.accessToken,
		token_id: input.token_id,
		refresh_token: input.refreshToken,
		expiresAt: input.expiresAt,
	};
	const runMutation = async (authToken: string) => {
		return postCredentialToConvexHttp(authToken, payload);
	};

	const cachedAuth = await readHaxAuth();
	if (cachedAuth?.accessToken) {
		try {
			return await runMutation(cachedAuth.accessToken);
		} catch (error) {
			if (!isExpiredAuthError(error)) {
				throw error;
			}
		}
	}

	try {
		return await runMutation(await getValidAccessToken(true));
	} catch (error) {
		if (!isEndedDesktopSessionError(error)) {
			throw error;
		}

		await startAuthServer();
		await runHaxLoginFlow();

		const refreshedAuth = await readHaxAuth();
		if (!refreshedAuth?.accessToken) {
			throw new Error("Hax auth completed without an access token.");
		}

		return await runMutation(refreshedAuth.accessToken);
	}
}

/**
 * Maps ChatGPT OAuth credentials into Convex `createCredential` args using OpenAI id_token claims.
 */
export function mapChatGPTCredentialsToConvexArgs(credentials: {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	account: Record<string, unknown> | null;
	raw: { id_token?: string };
}) {
	const pro = credentials.account?.["https://api.openai.com/auth"] as
		| OpenAiIdTokenClaims
		| undefined;
	if (!pro) {
		throw new Error("Missing OpenAI profile claims in ChatGPT credentials.");
	}
	return {
		accessToken: credentials.accessToken,
		refreshToken: credentials.refreshToken,
		expiresAt: credentials.expiresAt,
		account: credentials.account,
		token_id: credentials.raw.id_token,
		provider_subscriptionType: pro.chatgpt_plan_type,
		provider_user_id: pro.chatgpt_user_id,
		provider_account_id: pro.chatgpt_account_id,
		provider_sub_active_start: pro.chatgpt_subscription_active_start,
		provider_sub_active_until: pro.chatgpt_subscription_active_until,
	};
}
