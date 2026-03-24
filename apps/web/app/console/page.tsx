"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated } from "convex/react";
import {
	Activity,
	ArrowLeft,
	Code2,
	Globe,
	Key,
	Terminal,
	Zap,
} from "lucide-react";
import Link from "next/link";

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
		<div className="min-h-screen flex flex-col">
			{/* Top bar */}
			<header className="border-b border-[#1e1e1e] px-6 py-3 flex items-center justify-between bg-[#0d0d0d]">
				<div className="flex items-center gap-4">
					<Link
						href="/"
						className="flex items-center gap-1.5 text-xs text-[#666] hover:text-[#e8e8e8] transition-colors"
					>
						<ArrowLeft className="size-3" />
						<span>back</span>
					</Link>
					<div className="w-px h-4 bg-[#2a2a2a]" />
					<div className="flex items-center gap-2">
						<Terminal className="size-3.5 text-[#4ade80]" />
						<span className="text-xs font-semibold tracking-widest uppercase text-[#4ade80]">
							console
						</span>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-1.5">
						<div className="size-1.5 rounded-full bg-[#4ade80] animate-pulse" />
						<span className="text-[10px] text-[#4ade80] tracking-wider uppercase">
							live
						</span>
					</div>
					<div className="w-px h-4 bg-[#2a2a2a]" />
					<span className="text-xs text-[#555]">{user?.email}</span>
				</div>
			</header>

			{/* Main workspace */}
			<main className="flex-1 flex flex-col">
				{/* Hero section */}
				<div className="px-8 pt-16 pb-12 border-b border-[#1a1a1a]">
					<div className="max-w-3xl">
						<div className="flex items-center gap-3 mb-6">
							<div className="size-10 rounded-none bg-[#4ade80]/10 border border-[#4ade80]/20 flex items-center justify-center">
								<Terminal className="size-5 text-[#4ade80]" />
							</div>
							<div>
								<p className="text-[10px] tracking-[0.3em] uppercase text-[#555] mb-0.5">
									Developer Console
								</p>
								<h1 className="text-2xl font-bold text-[#e8e8e8] leading-tight">
									Build on the gateway.
								</h1>
							</div>
						</div>
						<p className="text-sm text-[#666] leading-relaxed max-w-xl">
							Access all AI models through a single unified API. Manage OAuth
							applications, inspect traffic, monitor usage, and configure your
							integration — all from one place.
						</p>
					</div>
				</div>

				{/* Grid of console panels */}
				<div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#161616]">
					<ConsoleCard
						icon={<Code2 className="size-4" />}
						label="API Playground"
						description="Send requests to any model interactively. Inspect headers, latency, and token usage in real time."
						badge="soon"
						accent="#4ade80"
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
						accent="#f59e0b"
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
						accent="#f43f5e"
					/>
					<ConsoleCard
						icon={<Terminal className="size-4" />}
						label="Logs"
						description="Stream live request logs. Filter by model, key, status code, and latency range."
						badge="soon"
						accent="#22d3ee"
					/>
				</div>
			</main>

			{/* Footer */}
			<footer className="border-t border-[#1e1e1e] px-8 py-4 bg-[#0d0d0d] flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="text-[10px] text-[#444] tracking-widest uppercase">
						pro gateway
					</span>
					<span className="text-[10px] text-[#333]">·</span>
					<span className="text-[10px] text-[#444]">console v0.1</span>
				</div>
				<div className="text-[10px] text-[#444] font-mono">
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
	const inner = (
		<div
			className="group relative bg-[#0a0a0a] p-6 hover:bg-[#0f0f0f] transition-colors h-full"
			style={{ "--card-accent": accent } as React.CSSProperties}
		>
			{/* Accent line top */}
			<div
				className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
				style={{ background: accent }}
			/>

			<div className="flex items-start justify-between mb-4">
				<div
					className="size-8 rounded-none flex items-center justify-center border"
					style={{
						background: `${accent}10`,
						borderColor: `${accent}25`,
						color: accent,
					}}
				>
					{icon}
				</div>
				{badge && (
					<span
						className="text-[9px] tracking-widest uppercase px-1.5 py-0.5 border font-medium"
						style={{
							color: accent,
							borderColor: `${accent}30`,
							background: `${accent}08`,
						}}
					>
						{badge}
					</span>
				)}
				{href && !badge && (
					<span
						className="text-[9px] tracking-widest uppercase px-1.5 py-0.5 border font-medium"
						style={{
							color: accent,
							borderColor: `${accent}30`,
							background: `${accent}08`,
						}}
					>
						open →
					</span>
				)}
			</div>

			<h3 className="text-sm font-semibold text-[#c8c8c8] mb-2 group-hover:text-[#e8e8e8] transition-colors">
				{label}
			</h3>
			<p className="text-xs text-[#4a4a4a] leading-relaxed group-hover:text-[#585858] transition-colors">
				{description}
			</p>
		</div>
	);

	if (href) {
		return (
			<Link href={href} className="block cursor-pointer">
				{inner}
			</Link>
		);
	}

	return inner;
}
