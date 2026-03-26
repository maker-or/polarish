"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated } from "convex/react";
import {
	Activity,
	ArrowLeft,
	Code2,
	Globe,
	Key,
	LayoutDashboard,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { cx } from "./_classes";
import { GsapPressLink } from "./gsap-press-link";
import { useGsapPress } from "./use-gsap-press";

export default function ConsolePage() {
	return (
		<Authenticated>
			<ConsoleApp />
		</Authenticated>
	);
}

function ConsoleApp() {
	const { user } = useAuth();

	return (
		<div className={cx.page}>
			<header className={cx.header}>
				<div className="flex items-center gap-4">
					<GsapPressLink href="/" className={cx.linkBack} scale={0.99}>
						<ArrowLeft className="size-4" />
						<span>Back</span>
					</GsapPressLink>
					<div className="h-4 w-px bg-border" />
					<div className="flex items-center gap-2.5">
						<div className="flex size-8 items-center justify-center rounded-none bg-muted/60 text-foreground shadow-sm">
							<LayoutDashboard className="size-4" />
						</div>
						<span className="text-sm font-semibold tracking-tight text-foreground">
							Console
						</span>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2 rounded-none border border-border/60 bg-muted/30 px-2.5 py-1">
						<div className="size-1.5 rounded-none bg-emerald-500/90 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
						<span className="text-xs font-medium text-muted-foreground">
							Live
						</span>
					</div>
					<div className="h-4 w-px bg-border" />
					<span className="max-w-[220px] truncate text-sm text-muted-foreground">
						{user?.email}
					</span>
				</div>
			</header>

			<main className="flex flex-1 flex-col">
				<div className="border-b border-border/40 px-8 pb-12 pt-14">
					<div className="max-w-3xl">
						<div className="mb-6 flex items-center gap-4">
							<div className={cx.iconBox}>
								<LayoutDashboard className="size-5" />
							</div>
							<div>
								<p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
									Developer console
								</p>
								<h1 className={cx.title}>Build on the gateway.</h1>
							</div>
						</div>
						<p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
							Access all AI models through a single unified API. Manage OAuth
							applications, inspect traffic, monitor usage, and configure your
							integration — all from one place.
						</p>
					</div>
				</div>

				<div className="grid flex-1 grid-cols-1 gap-4 bg-muted/20 p-4 md:grid-cols-2 md:p-6 lg:grid-cols-3">
					<ConsoleCard
						icon={<Code2 className="size-4" />}
						label="API Playground"
						description="Send requests to any model interactively. Inspect headers, latency, and token usage in real time."
						badge="soon"
						accent="#34d399"
					/>
					<ConsoleCard
						icon={<Key className="size-4" />}
						label="OAuth Apps"
						description="Create and manage OAuth 2.0 applications. Let your users build on top of the gateway."
						href="/console/apps"
						accent="#60a5fa"
					/>
					<ConsoleCard
						icon={<Activity className="size-4" />}
						label="Usage Analytics"
						description="Per-key token consumption, request volume, latency percentiles, and model distribution."
						badge="soon"
						accent="#fbbf24"
					/>
					<ConsoleCard
						icon={<Globe className="size-4" />}
						label="Endpoints"
						description="Browse and test all available model endpoints. View supported parameters and response schemas."
						badge="soon"
						accent="#a78bfa"
					/>
					<ConsoleCard
						icon={<Zap className="size-4" />}
						label="Webhooks"
						description="Configure event webhooks for subscription changes, key rotations, and usage threshold alerts."
						badge="soon"
						accent="#fb7185"
					/>
					<ConsoleCard
						icon={<LayoutDashboard className="size-4" />}
						label="Logs"
						description="Stream live request logs. Filter by model, key, status code, and latency range."
						badge="soon"
						accent="#22d3ee"
					/>
				</div>
			</main>

			<footer className="flex items-center justify-between border-t border-border/50 bg-card/30 px-8 py-4 backdrop-blur-sm">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="font-medium">Pro gateway</span>
					<span className="text-border">·</span>
					<span>Console v0.1</span>
				</div>
				<div className="font-mono text-xs text-muted-foreground">
					{new Date().toISOString().slice(0, 10)}
				</div>
			</footer>
		</div>
	);
}

interface ConsoleCardProps {
	icon: React.ReactNode;
	label: string;
	description: string;
	badge?: string;
	href?: string;
	accent: string;
}

function ConsoleCard({
	icon,
	label,
	description,
	badge,
	href,
	accent,
}: ConsoleCardProps) {
	const linkRef = useRef<HTMLAnchorElement>(null);
	useGsapPress(linkRef, {
		scale: 0.99,
		pressDuration: 0.12,
		releaseDuration: 0.26,
	});

	const inner = (
		<div
			className={cx.consoleCardInner}
			style={{ "--card-accent": accent } as React.CSSProperties}
		>
			<div className="mb-4 flex items-start justify-between">
				<div
					className="flex size-10 items-center justify-center rounded-none border shadow-sm transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
					style={{
						background: `${accent}18`,
						borderColor: `${accent}40`,
						color: accent,
					}}
				>
					{icon}
				</div>
				{badge && (
					<span
						className="rounded-none border px-2.5 py-0.5 text-[11px] font-medium"
						style={{
							color: accent,
							borderColor: `${accent}45`,
							background: `${accent}12`,
						}}
					>
						{badge}
					</span>
				)}
				{href && !badge && (
					<span
						className="rounded-none border px-2.5 py-0.5 text-[11px] font-medium"
						style={{
							color: accent,
							borderColor: `${accent}45`,
							background: `${accent}12`,
						}}
					>
						Open →
					</span>
				)}
			</div>

			<h3 className="mb-2 text-sm font-semibold text-foreground transition-colors group-hover:text-foreground">
				{label}
			</h3>
			<p className="text-xs leading-relaxed text-muted-foreground">
				{description}
			</p>
		</div>
	);

	if (href) {
		return (
			<Link ref={linkRef} href={href} className="block h-full cursor-pointer">
				{inner}
			</Link>
		);
	}

	return inner;
}
