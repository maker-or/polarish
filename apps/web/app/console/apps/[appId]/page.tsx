"use client";

import { Authenticated, useQuery } from "convex/react";
import {
	ArrowLeft,
	Check,
	Copy,
	ExternalLink,
	Key,
	Settings,
	Terminal,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

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

	const copyToClipboard = (text: string, key: string) => {
		navigator.clipboard.writeText(text);
		setCopied(key);
		if (copyResetTimeoutRef.current !== null) {
			window.clearTimeout(copyResetTimeoutRef.current);
		}
		copyResetTimeoutRef.current = window.setTimeout(() => setCopied(null), 2000);
	};

	if (app === undefined) {
		return (
			<div className="min-h-screen flex flex-col">
				<Header appName="…" appId={appId} />
				<main className="flex-1 px-8 py-10">
					<div className="space-y-4 max-w-3xl">
						{[0, 1, 2].map((i) => (
							<div
								key={i}
								className="h-16 bg-[#0f0f0f] border border-[#1a1a1a] animate-pulse"
							/>
						))}
					</div>
				</main>
			</div>
		);
	}

	if (app === null) {
		return (
			<div className="min-h-screen flex flex-col">
				<Header appName="Not found" appId={appId} />
				<main className="flex-1 px-8 py-10">
					<p className="text-sm text-[#f43f5e]">App not found.</p>
				</main>
			</div>
		);
	}

	const typedApp = app as {
		_id: string;
		name: string;
		description?: string;
		workosClientId: string;
		redirectUri: Array<{ uri: string; default: boolean }>;
		createdAt: number;
		updatedAt: number;
	};

	return (
		<div className="min-h-screen flex flex-col">
			<Header appName={typedApp.name} appId={appId} />

			<main className="flex-1 px-8 py-10 max-w-3xl w-full">
				{/* App meta */}
				<div className="mb-10">
					<h1 className="text-xl font-bold text-[#e8e8e8] mb-1">
						{typedApp.name}
					</h1>
					{typedApp.description && (
						<p className="text-xs text-[#555]">{typedApp.description}</p>
					)}
					<p className="text-[10px] text-[#3a3a3a] mt-2 font-mono">
						Created{" "}
						{new Date(typedApp.createdAt).toLocaleDateString("en-US", {
							year: "numeric",
							month: "short",
							day: "numeric",
						})}
					</p>
				</div>

				{/* Quick start guide */}
				<section className="mb-10">
					<h2 className="text-[10px] tracking-widest uppercase text-[#555] mb-4">
						Quick Start
					</h2>
					<div className="border border-[#1a1a1a] bg-[#0d0d0d] divide-y divide-[#1a1a1a]">
						<Step number={1} title="Get your credentials">
							<p className="text-xs text-[#555] mb-3">
								Your Client ID is public. Your Client Secret must be kept
								private — never expose it in client-side code.
							</p>
							<Link
								href={`/console/apps/${appId}/credentials`}
								className="inline-flex items-center gap-1.5 text-xs text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
							>
								<Key className="size-3" />
								Manage credentials
								<ExternalLink className="size-2.5" />
							</Link>
						</Step>

						<Step number={2} title="Configure the authorization URL">
							<p className="text-xs text-[#555] mb-2">
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
							<p className="text-xs text-[#555] mb-2">
								After the user authorizes, exchange the{" "}
								<code className="text-[#e8e8e8] bg-[#1a1a1a] px-1">code</code>{" "}
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
							<p className="text-xs text-[#555] mb-2">
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

				{/* Client ID */}
				<section className="mb-10">
					<h2 className="text-[10px] tracking-widest uppercase text-[#555] mb-4">
						Client ID
					</h2>
					<div className="flex items-center gap-2">
						<code className="flex-1 bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2.5 text-xs font-mono text-[#c8c8c8] select-all">
							{typedApp.workosClientId}
						</code>
						<button
							type="button"
							onClick={() =>
								copyToClipboard(typedApp.workosClientId, "client-id")
							}
							className="size-9 border border-[#1e1e1e] bg-[#0d0d0d] hover:bg-[#1a1a1a] flex items-center justify-center transition-colors"
						>
							{copied === "client-id" ? (
								<Check className="size-3 text-[#4ade80]" />
							) : (
								<Copy className="size-3 text-[#555]" />
							)}
						</button>
					</div>
				</section>

				{/* Redirect URIs */}
				<section className="mb-10">
					<h2 className="text-[10px] tracking-widest uppercase text-[#555] mb-4">
						Redirect URIs
					</h2>
					<div className="space-y-1">
						{typedApp.redirectUri.map(
							(r: { uri: string; default: boolean }, i: number) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: redirect URI list is index-ordered by design
									key={i}
									className="flex items-center gap-3 bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2"
								>
									{r.default && (
										<span className="text-[9px] tracking-widest uppercase border border-[#4ade80]/20 text-[#4ade80] bg-[#4ade80]/05 px-1.5 py-0.5 shrink-0">
											default
										</span>
									)}
									<code className="text-xs font-mono text-[#888]">{r.uri}</code>
								</div>
							),
						)}
					</div>
					<Link
						href={`/console/apps/${appId}/settings`}
						className="inline-flex items-center gap-1.5 text-[10px] text-[#444] hover:text-[#888] mt-3 transition-colors"
					>
						<Settings className="size-2.5" />
						Edit redirect URIs in settings
					</Link>
				</section>
			</main>

			<footer className="border-t border-[#1e1e1e] px-8 py-4 bg-[#0d0d0d] flex items-center justify-between">
				<span className="text-[10px] text-[#444] tracking-widest uppercase">
					pro gateway · oauth apps
				</span>
				<span className="text-[10px] text-[#444] font-mono">
					{new Date().toISOString().slice(0, 10)}
				</span>
			</footer>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({ appName, appId }: { appName: string; appId: string }) {
	return (
		<header className="border-b border-[#1e1e1e] px-6 py-3 flex items-center justify-between bg-[#0d0d0d]">
			<div className="flex items-center gap-4">
				<Link
					href="/console/apps"
					className="flex items-center gap-1.5 text-xs text-[#666] hover:text-[#e8e8e8] transition-colors"
				>
					<ArrowLeft className="size-3" />
					<span>apps</span>
				</Link>
				<div className="w-px h-4 bg-[#2a2a2a]" />
				<div className="flex items-center gap-2">
					<Terminal className="size-3.5 text-[#60a5fa]" />
					<span className="text-xs font-semibold text-[#60a5fa] truncate max-w-48">
						{appName}
					</span>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Link
					href={`/console/apps/${appId}/credentials`}
					className="text-[10px] text-[#444] hover:text-[#888] transition-colors tracking-widest uppercase"
				>
					Credentials
				</Link>
				<span className="text-[#2a2a2a]">·</span>
				<Link
					href={`/console/apps/${appId}/settings`}
					className="text-[10px] text-[#444] hover:text-[#888] transition-colors tracking-widest uppercase"
				>
					Settings
				</Link>
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
			<div className="flex items-center gap-3 mb-3">
				<span className="size-5 border border-[#2a2a2a] text-[10px] font-mono text-[#444] flex items-center justify-center shrink-0">
					{number}
				</span>
				<h3 className="text-xs font-semibold text-[#aaa]">{title}</h3>
			</div>
			<div className="pl-8">{children}</div>
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
		<div className="relative group">
			<pre className="bg-[#080808] border border-[#1a1a1a] px-4 py-3 text-[10px] font-mono text-[#888] leading-relaxed overflow-x-auto whitespace-pre-wrap">
				{code}
			</pre>
			<button
				type="button"
				onClick={() => onCopy(code, copyKey)}
				className="absolute top-2 right-2 size-7 border border-[#1e1e1e] bg-[#0d0d0d] hover:bg-[#1a1a1a] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
			>
				{copied === copyKey ? (
					<Check className="size-3 text-[#4ade80]" />
				) : (
					<Copy className="size-3 text-[#555]" />
				)}
			</button>
		</div>
	);
}
