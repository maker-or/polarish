"use client";

import { Authenticated, useQuery } from "convex/react";
import { ExternalLink, Plus, Terminal } from "lucide-react";
import Link from "next/link";
import { api } from "../../../../../convex/_generated/api";

export default function AppsPage() {
	return (
		<Authenticated>
			<AppsList />
		</Authenticated>
	);
}

function AppsList() {
	const apps = useQuery(api.console.listApps, {});

	return (
		<div className="min-h-screen flex flex-col">
			<header className="border-b border-[#1e1e1e] px-6 py-3 flex items-center justify-between bg-[#0d0d0d]">
				<div className="flex items-center gap-2">
					<Terminal className="size-3.5 text-[#60a5fa]" />
					<span className="text-xs font-semibold text-[#60a5fa]">apps</span>
				</div>
				<Link
					href="/console/apps/new"
					className="inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-[#444] hover:text-[#e8e8e8] border border-[#1e1e1e] bg-[#0d0d0d] hover:bg-[#1a1a1a] px-3 py-1.5 transition-colors"
				>
					<Plus className="size-3" />
					New app
				</Link>
			</header>

			<main className="flex-1 px-8 py-10">
				<div className="max-w-3xl">
					<div className="mb-8">
						<h1 className="text-xl font-bold text-[#e8e8e8] mb-1">
							OAuth Applications
						</h1>
						<p className="text-xs text-[#555]">
							Manage the OAuth apps that connect to your gateway.
						</p>
					</div>

					{apps === undefined && (
						<div className="space-y-2">
							{[0, 1, 2].map((i) => (
								<div
									key={i}
									className="h-16 bg-[#0f0f0f] border border-[#1a1a1a] animate-pulse"
								/>
							))}
						</div>
					)}

					{apps !== undefined && apps.length === 0 && (
						<div className="border border-dashed border-[#2a2a2a] px-8 py-12 text-center">
							<Terminal className="size-5 text-[#333] mx-auto mb-3" />
							<p className="text-xs text-[#555] mb-4">
								No apps yet. Create one to get started.
							</p>
							<Link
								href="/console/apps/new"
								className="inline-flex items-center gap-1.5 text-xs text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
							>
								<Plus className="size-3" />
								Create your first app
							</Link>
						</div>
					)}

					{apps !== undefined && apps.length > 0 && (
						<div className="divide-y divide-[#1a1a1a] border border-[#1a1a1a] bg-[#0d0d0d]">
							{apps.map((app) => (
								<Link
									key={app._id}
									href={`/console/apps/${app._id}`}
									className="flex items-center justify-between px-5 py-4 hover:bg-[#111] transition-colors group"
								>
									<div className="min-w-0">
										<div className="flex items-center gap-2 mb-0.5">
											<span className="text-sm font-semibold text-[#e8e8e8] truncate">
												{app.name}
											</span>
										</div>
										{app.description && (
											<p className="text-xs text-[#555] truncate">
												{app.description}
											</p>
										)}
										<p className="text-[10px] font-mono text-[#3a3a3a] mt-1 truncate">
											{app.workosClientId}
										</p>
									</div>
									<ExternalLink className="size-3 text-[#333] group-hover:text-[#555] shrink-0 ml-4 transition-colors" />
								</Link>
							))}
						</div>
					)}
				</div>
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
