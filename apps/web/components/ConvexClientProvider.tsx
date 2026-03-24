"use client";

import {
	AuthKitProvider,
	useAccessToken,
	useAuth,
} from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { type ReactNode, useCallback, useState } from "react";

function logTokenClaimsForDebug(token: string) {
	try {
		const payload = token.split(".")[1];
		if (!payload) {
			console.debug("[auth-debug] token missing payload segment");
			return;
		}

		const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64.padEnd(
			base64.length + ((4 - (base64.length % 4)) % 4),
			"=",
		);
		const json = atob(padded);
		const claims = JSON.parse(json) as {
			iss?: string;
			aud?: string | string[];
			sub?: string;
		};

		console.log("[auth-debug] WorkOS token claims", {
			iss: claims.iss,
			aud: claims.aud,
			sub: claims.sub,
		});
	} catch (error) {
		console.log("[auth-debug] failed to decode token claims", error);
	}
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
	const [convex] = useState(() => {
		return new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
	});
	return (
		<AuthKitProvider>
			<ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
				{children}
			</ConvexProviderWithAuth>
		</AuthKitProvider>
	);
}

function useAuthFromAuthKit() {
	const { user, loading: isLoading } = useAuth();
	const { getAccessToken, refresh } = useAccessToken();

	const isAuthenticated = !!user;

	const fetchAccessToken = useCallback(
		async ({
			forceRefreshToken,
		}: {
			forceRefreshToken?: boolean;
		} = {}): Promise<string | null> => {
			if (!user) {
				console.log("[auth-debug] fetchAccessToken called with no user");
				return null;
			}

			console.log("[auth-debug] fetchAccessToken called", {
				forceRefreshToken: !!forceRefreshToken,
				hasUser: !!user,
			});

			try {
				if (forceRefreshToken) {
					const token = (await refresh()) ?? null;
					if (token) {
						logTokenClaimsForDebug(token);
					}
					return token;
				}

				const token = (await getAccessToken()) ?? null;
				if (token) {
					logTokenClaimsForDebug(token);
				}
				return token;
			} catch (error) {
				console.error("Failed to get access token:", error);
				return null;
			}
		},
		[user, refresh, getAccessToken],
	);

	return {
		isLoading,
		isAuthenticated,
		fetchAccessToken,
	};
}
