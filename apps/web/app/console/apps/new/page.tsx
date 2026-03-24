"use client";

import { Authenticated, useAction } from "convex/react";
import {
	AlertTriangle,
	ArrowLeft,
	Loader2,
	Plus,
	Terminal,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";

export default function NewAppPage() {
	return (
		<Authenticated>
			<CreateAppView />
		</Authenticated>
	);
}

function CreateAppView() {
	const router = useRouter();
	const createApp = useAction(api.console.createApp);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [redirectUris, setRedirectUris] = useState<string[]>([
		"http://localhost:3000/callback",
	]);
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const addUri = () => setRedirectUris((prev) => [...prev, ""]);
	const removeUri = (i: number) =>
		setRedirectUris((prev) => prev.filter((_, idx) => idx !== i));
	const updateUri = (i: number, val: string) =>
		setRedirectUris((prev) => prev.map((u, idx) => (idx === i ? val : u)));

	const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const trimmedName = name.trim();
		if (!trimmedName) {
			setError("App name is required.");
			return;
		}

		const validUris = redirectUris.map((u) => u.trim()).filter(Boolean);
		if (validUris.length === 0) {
			setError("At least one redirect URI is required.");
			return;
		}

		for (const uri of validUris) {
			try {
				new URL(uri);
			} catch {
				setError(`Invalid redirect URI: ${uri}`);
				return;
			}
		}

		setIsCreating(true);
		setError(null);
		try {
			const result = (await createApp({
				name: trimmedName,
				description: description.trim() || undefined,
				redirectUris: validUris,
			})) as { appId: string };
			router.push(`/console/apps/${result.appId}`);
		} catch (err) {
			if (!isMountedRef.current) return;
			setError(
				err instanceof Error
					? err.message
					: "Failed to create app. Please try again.",
			);
			setIsCreating(false);
		}
	};

	return (
		<div className="min-h-screen flex flex-col">
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
						<span className="text-xs font-semibold text-[#60a5fa]">new app</span>
					</div>
				</div>
			</header>

			<main className="flex-1 px-8 py-10 max-w-2xl w-full">
				<div className="mb-8">
					<h1 className="text-lg font-bold text-[#e8e8e8] tracking-tight mb-1">
						Create OAuth Application
					</h1>
					<p className="text-xs text-[#555]">
						Create a new app to issue OAuth credentials for your integration.
					</p>
				</div>

				<form onSubmit={handleCreate} className="space-y-7">
					<div>
						<label
							htmlFor="app-name"
							className="block text-[10px] tracking-widest uppercase text-[#666] mb-2"
						>
							App Name <span className="text-[#f43f5e]">*</span>
						</label>
						<input
							id="app-name"
							type="text"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								if (error) setError(null);
							}}
							required
							maxLength={100}
							placeholder="My production app"
							className="w-full bg-[#0d0d0d] border border-[#1e1e1e] focus:border-[#60a5fa]/50 outline-none text-sm text-[#e8e8e8] placeholder:text-[#333] px-3 py-2.5 transition-colors"
						/>
					</div>

					<div>
						<label
							htmlFor="app-description"
							className="block text-[10px] tracking-widest uppercase text-[#666] mb-2"
						>
							Description <span className="text-[#3a3a3a] normal-case">optional</span>
						</label>
						<textarea
							id="app-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							maxLength={300}
							placeholder="Used internally to identify this app"
							className="w-full bg-[#0d0d0d] border border-[#1e1e1e] focus:border-[#60a5fa]/50 outline-none text-sm text-[#e8e8e8] placeholder:text-[#333] px-3 py-2.5 transition-colors resize-none"
						/>
					</div>

					<div>
						<p className="block text-[10px] tracking-widest uppercase text-[#666] mb-2">
							Redirect URIs <span className="text-[#f43f5e]">*</span>
						</p>
						<div className="space-y-2">
							{redirectUris.map((uri, i) => (
								<div key={`${i}-${uri}`} className="flex items-center gap-2">
									<div className="flex-1 flex items-center border border-[#1e1e1e] focus-within:border-[#60a5fa]/50 transition-colors">
										<span className="text-[10px] text-[#444] px-2 shrink-0 font-mono">
											{i === 0 ? "default" : `uri ${i + 1}`}
										</span>
										<div className="w-px h-4 bg-[#1e1e1e]" />
										<input
											type="url"
											value={uri}
											onChange={(e) => {
												updateUri(i, e.target.value);
												if (error) setError(null);
											}}
											placeholder="https://yourapp.com/auth/callback"
											className="flex-1 bg-transparent outline-none text-xs text-[#e8e8e8] placeholder:text-[#2a2a2a] px-3 py-2.5"
										/>
									</div>
									{redirectUris.length > 1 && (
										<button
											type="button"
											onClick={() => removeUri(i)}
											className="text-[#333] hover:text-[#f43f5e] transition-colors p-1"
										>
											<Trash2 className="size-3" />
										</button>
									)}
								</div>
							))}
						</div>
						<button
							type="button"
							onClick={addUri}
							className="mt-3 flex items-center gap-1.5 text-[10px] text-[#444] hover:text-[#60a5fa] transition-colors"
						>
							<Plus className="size-3" />
							Add another URI
						</button>
					</div>

					{error && (
						<div className="flex items-start gap-2 border border-[#f43f5e]/30 bg-[#f43f5e]/05 px-3 py-2">
							<AlertTriangle className="size-3 text-[#f43f5e] mt-0.5 shrink-0" />
							<p className="text-xs text-[#f43f5e]">{error}</p>
						</div>
					)}

					<div className="flex items-center gap-3">
						<button
							type="submit"
							disabled={isCreating}
							className="flex items-center gap-2 text-xs border border-[#60a5fa]/40 bg-[#60a5fa]/10 text-[#60a5fa] hover:bg-[#60a5fa]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-4 py-2"
						>
							{isCreating ? (
								<>
									<Loader2 className="size-3 animate-spin" />
									Creating...
								</>
							) : (
								"Create App"
							)}
						</button>
						<Link
							href="/console/apps"
							className="text-xs text-[#444] hover:text-[#888] transition-colors px-1"
						>
							Cancel
						</Link>
					</div>
				</form>
			</main>
		</div>
	);
}
