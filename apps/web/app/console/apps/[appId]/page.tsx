"use client";

import { Authenticated, useQuery } from "convex/react";
import { ArrowLeft, Check, Copy, Settings } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { cx } from "../../_classes";
import { GsapPressLink } from "../../gsap-press-link";
import { ClientSecretsSection } from "./client-secrets-section";

export default function AppOverviewPage() {
	return (
		<Authenticated>
			<AppOverview />
		</Authenticated>
	);
}

function AppOverview() {
	const params = useParams();
	const appId = params.appId as Id<"consoleApp">;
	const [copied, setCopied] = useState<string | null>(null);
	const copyResetTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (copyResetTimeoutRef.current !== null) {
				window.clearTimeout(copyResetTimeoutRef.current);
			}
		};
	}, []);

	const app = useQuery(api.console.getApp, { appId });
	const membership = useQuery(api.org.getMyMembership);
	const isAdmin = membership?.role === "admin";

	useEffect(() => {
		if (app === undefined || app === null) return;
		if (
			typeof window === "undefined" ||
			window.location.hash !== "#client-secrets"
		)
			return;
		queueMicrotask(() => {
			document.getElementById("client-secrets")?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
		});
	}, [app]);

	const copyToClipboard = (text: string, key: string) => {
		navigator.clipboard.writeText(text);
		setCopied(key);
		if (copyResetTimeoutRef.current !== null) {
			window.clearTimeout(copyResetTimeoutRef.current);
		}
		copyResetTimeoutRef.current = window.setTimeout(
			() => setCopied(null),
			2000,
		);
	};

	if (app === undefined) {
		return (
			<div className={cx.page}>
				<Header appName="…" appId={appId} />
				<main className="grid min-h-0 flex-1 grid-cols-2 gap-0 px-8 py-8">
					<div className="min-h-0 space-y-3 overflow-hidden">
						{[0, 1, 2].map((i) => (
							<div
								key={i}
								className="h-16 animate-pulse rounded-none bg-muted/40"
							/>
						))}
					</div>
					<div className="min-h-0 space-y-3 overflow-hidden">
						{[0, 1].map((i) => (
							<div
								key={i}
								className="h-16 animate-pulse rounded-none bg-muted/40"
							/>
						))}
					</div>
				</main>
			</div>
		);
	}

	if (app === null) {
		return (
			<div className={cx.page}>
				<Header appName="Not found" appId={appId} />
				<main className="flex-1 px-8 py-10">
					<p className="text-sm text-destructive">App not found.</p>
				</main>
			</div>
		);
	}

	const typedApp = app as {
		_id: string;
		name: string;
		domains: string[];
		workosClientId: string;
		redirectUri: Array<{ uri: string; default: boolean }>;
		createdAt: number;
		updatedAt: number;
	};

	return (
		<div className={cx.page}>
			<Header
				appName={typedApp.name}
				appId={appId}
				createdAt={typedApp.createdAt}
			/>

			<main className="grid min-h-0 flex-1 grid-cols-2">
				<div className="min-h-0 overflow-y-auto px-8 py-8 sm:px-10">
					<section>
						<h2 className="mb-4 text-sm font-semibold text-foreground">
							Quick start
						</h2>
						<div className="divide-y divide-border/60">
							<Step number={1} title="Get your credentials">
								<p className="mb-3 text-xs leading-relaxed text-muted-foreground">
									Your Client ID is in the right column. Create a client secret
									there when you need to exchange codes — keep secrets
									server-side only.
								</p>
							</Step>

							<Step number={2} title="Configure the authorization URL">
								<p className="mb-2 text-xs leading-relaxed text-muted-foreground">
									Redirect users to this URL to start the OAuth flow:
								</p>
								<CodeBlock
									code={`https://{authkit_domain}/oauth2/authorize?
  client_id=${typedApp.workosClientId}
  &response_type=code
  &redirect_uri={your_redirect_uri}
  &scope=openid profile email offline_access`}
									copyKey="auth-url"
									copied={copied}
									onCopy={copyToClipboard}
								/>
							</Step>

							<Step number={3} title="Exchange the code for tokens">
								<p className="mb-2 text-xs leading-relaxed text-muted-foreground">
									After the user authorizes, exchange the{" "}
									<code className="rounded-none bg-muted px-1.5 py-0.5 font-mono text-foreground text-[11px]">
										code
									</code>{" "}
									for an access token:
								</p>
								<CodeBlock
									code={`POST https://{authkit_domain}/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={code}
&client_id=${typedApp.workosClientId}
&client_secret={your_client_secret}
&redirect_uri={your_redirect_uri}`}
									copyKey="token-exchange"
									copied={copied}
									onCopy={copyToClipboard}
								/>
							</Step>

							<Step number={4} title="Use the token">
								<p className="mb-2 text-xs leading-relaxed text-muted-foreground">
									Pass the access token as a Bearer token to the gateway:
								</p>
								<CodeBlock
									code="Authorization: Bearer {access_token}"
									copyKey="use-token"
									copied={copied}
									onCopy={copyToClipboard}
								/>
							</Step>
						</div>
					</section>
				</div>

				<div className="min-h-0 space-y-10 overflow-y-auto px-8 py-8 sm:px-10">
					<section>
						<h2 className="mb-4 text-sm font-semibold text-foreground">
							Client ID
						</h2>
						<div className="flex items-center gap-2">
							<code className="min-w-0 flex-1 select-all rounded-none border border-border/60 bg-muted/40 px-3.5 py-2.5 font-mono text-xs text-foreground">
								{typedApp.workosClientId}
							</code>
							<button
								type="button"
								onClick={() =>
									copyToClipboard(typedApp.workosClientId, "client-id")
								}
								className={cx.iconCopyBtn}
							>
								{copied === "client-id" ? (
									<Check className="size-4 text-emerald-500" />
								) : (
									<Copy className="size-4 text-muted-foreground" />
								)}
							</button>
						</div>
					</section>

					<ClientSecretsSection appId={appId} isAdmin={isAdmin} />

					<section>
						<h2 className="mb-4 text-sm font-semibold text-foreground">
							Allowed domains
						</h2>
						{typedApp.domains.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No domains configured. Add origins where your frontend runs in{" "}
								<GsapPressLink
									href={`/console/apps/${appId}/settings`}
									className={cx.linkPrimary}
									scale={0.99}
								>
									settings
								</GsapPressLink>
								.
							</p>
						) : (
							<div className="space-y-2">
								{typedApp.domains.map((origin, i) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: ordered list
										key={i}
										className={cx.listRow}
									>
										<code className="font-mono text-xs text-muted-foreground">
											{origin}
										</code>
									</div>
								))}
							</div>
						)}
						<GsapPressLink
							href={`/console/apps/${appId}/settings`}
							className={`mt-3 ${cx.linkInline}`}
							scale={0.97}
						>
							<Settings className="size-3.5" />
							Edit domains in settings
						</GsapPressLink>
					</section>

					<section>
						<h2 className="mb-4 text-sm font-semibold text-foreground">
							Redirect URIs
						</h2>
						<div className="space-y-2">
							{typedApp.redirectUri.map(
								(row: { uri: string; default: boolean }, i: number) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: redirect URI list is index-ordered by design
										key={i}
										className="flex items-center gap-3 rounded-none border border-border/60 bg-card/40 px-3 py-2.5"
									>
										{row.default && (
											<span className="shrink-0 rounded-none border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
												default
											</span>
										)}
										<code className="min-w-0 break-all font-mono text-xs text-muted-foreground">
											{row.uri}
										</code>
									</div>
								),
							)}
						</div>
						<GsapPressLink
							href={`/console/apps/${appId}/settings`}
							className={`mt-3 ${cx.linkInline}`}
							scale={0.97}
						>
							<Settings className="size-3.5" />
							Edit redirect URIs in settings
						</GsapPressLink>
					</section>
				</div>
			</main>

			<footer className="flex items-center justify-between border-t border-border/50 bg-card/30 px-8 py-4 backdrop-blur-sm">
				<span className="text-xs text-muted-foreground">
					Pro gateway · OAuth apps
				</span>
				<span className="font-mono text-xs text-muted-foreground">
					{new Date().toISOString().slice(0, 10)}
				</span>
			</footer>
		</div>
	);
}

function Header({
	appName,
	appId,
	createdAt,
}: {
	appName: string;
	appId: string;
	createdAt?: number;
}) {
	const createdLabel =
		createdAt != null
			? new Date(createdAt).toLocaleDateString("en-US", {
					year: "numeric",
					month: "short",
					day: "numeric",
				})
			: null;

	return (
		<header className={cx.header}>
			<div className="flex w-full min-w-0 items-center justify-between gap-4">
				<div className="flex min-w-0 flex-1 items-center gap-4">
					<GsapPressLink
						href="/console/apps"
						className={cx.linkBack}
						scale={0.99}
					>
						<ArrowLeft className="size-4" />
						<span>Apps</span>
					</GsapPressLink>
					<div className="h-4 w-px shrink-0 bg-border" />
					<div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
						<span className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">
							{appName}
						</span>
						{createdLabel != null && (
							<span className="shrink-0 font-mono text-xs text-muted-foreground">
								Created {createdLabel}
							</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					<GsapPressLink
						href={`/console/apps/${appId}/settings`}
						className={cx.navPill}
						scale={0.97}
					>
						Settings
					</GsapPressLink>
				</div>
			</div>
		</header>
	);
}

function Step({
	number,
	title,
	children,
}: {
	number: number;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="px-5 py-5">
			<div className="mb-3 flex items-center gap-3">
				<span className="flex size-7 shrink-0 items-center justify-center rounded-none border border-border/60 bg-muted/50 text-xs font-semibold text-muted-foreground">
					{number}
				</span>
				<h3 className="text-sm font-semibold text-foreground">{title}</h3>
			</div>
			<div className="pl-10">{children}</div>
		</div>
	);
}

function CodeBlock({
	code,
	copyKey,
	copied,
	onCopy,
}: {
	code: string;
	copyKey: string;
	copied: string | null;
	onCopy: (text: string, key: string) => void;
}) {
	return (
		<div className="group relative">
			<pre className={cx.codeBlock}>{code}</pre>
			<button
				type="button"
				onClick={() => onCopy(code, copyKey)}
				className={cx.codeCopyBtn}
			>
				{copied === copyKey ? (
					<Check className="size-3.5 text-emerald-500" />
				) : (
					<Copy className="size-3.5 text-muted-foreground" />
				)}
			</button>
		</div>
	);
}
