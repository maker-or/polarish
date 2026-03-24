"use client";

import { Authenticated, useAction, useQuery } from "convex/react";
import {
	AlertTriangle,
	ArrowLeft,
	Loader2,
	Plus,
	Terminal,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

export default function AppSettingsPage() {
	return (
		<Authenticated>
			<AppSettingsView />
		</Authenticated>
	);
}

function AppSettingsView() {
	const params = useParams();
	const router = useRouter();
	const appId = params.appId as Id<"consoleApp">;

	// biome-ignore lint/suspicious/noExplicitAny: api.console not yet typed until convex codegen runs
	const app = useQuery((api as any).console.getApp, { appId });
	// biome-ignore lint/suspicious/noExplicitAny: api.console not yet typed until convex codegen runs
	const updateApp = useAction((api as any).console.updateApp);
	// biome-ignore lint/suspicious/noExplicitAny: api.console not yet typed until convex codegen runs
	const deleteApp = useAction((api as any).console.deleteApp);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [redirectUris, setRedirectUris] = useState<string[]>([""]);
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [deleteConfirmText, setDeleteConfirmText] = useState("");
	const isMountedRef = useRef(true);
	const successTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			if (successTimeoutRef.current !== null) {
				window.clearTimeout(successTimeoutRef.current);
			}
		};
	}, []);

	// Initialise form from loaded app
	useEffect(() => {
		if (!app) return;
		const typedApp = app as {
			name: string;
			description?: string;
			redirectUri: Array<{ uri: string; default: boolean }>;
		};
		setName(typedApp.name);
		setDescription(typedApp.description ?? "");
		setRedirectUris(
			typedApp.redirectUri.length > 0
				? typedApp.redirectUri.map((r) => r.uri)
				: [""],
		);
	}, [app]);

	const addUri = () => setRedirectUris((prev) => [...prev, ""]);
	const removeUri = (i: number) =>
		setRedirectUris((prev) => prev.filter((_, idx) => idx !== i));
	const updateUri = (i: number, val: string) =>
		setRedirectUris((prev) => prev.map((u, idx) => (idx === i ? val : u)));

	const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
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
		setIsSaving(true);
		setError(null);
		setSuccess(false);
		try {
			await updateApp({
				appId,
				name: trimmedName,
				description: description.trim() || undefined,
				redirectUris: validUris,
			});
			if (!isMountedRef.current) return;
			setSuccess(true);
			if (successTimeoutRef.current !== null) {
				window.clearTimeout(successTimeoutRef.current);
			}
			successTimeoutRef.current = window.setTimeout(() => {
				if (isMountedRef.current) setSuccess(false);
			}, 3000);
		} catch (err) {
			if (isMountedRef.current) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to save. Please try again.",
				);
			}
		} finally {
			if (isMountedRef.current) setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		const typedApp = app as { name: string } | null;
		if (deleteConfirmText !== typedApp?.name) return;
		setIsDeleting(true);
		try {
			await deleteApp({ appId });
			router.push("/console/apps");
		} catch (err) {
			if (isMountedRef.current) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to delete app. Please try again.",
				);
				setIsDeleting(false);
				setShowDeleteConfirm(false);
			}
		}
	};

	if (app === undefined) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<Loader2 className="size-5 text-[#444] animate-spin" />
			</div>
		);
	}

	if (app === null) {
		return (
			<div className="min-h-screen flex flex-col">
				<SettingsHeader appId={appId} appName="Not found" />
				<main className="flex-1 px-8 py-10">
					<p className="text-sm text-[#f43f5e]">App not found.</p>
				</main>
			</div>
		);
	}

	const typedApp = app as { name: string };

	return (
		<div className="min-h-screen flex flex-col">
			<SettingsHeader appId={appId} appName={typedApp.name} />

			<main className="flex-1 px-8 py-10 max-w-2xl w-full">
				<div className="mb-8">
					<h1 className="text-lg font-bold text-[#e8e8e8] tracking-tight mb-1">
						App Settings
					</h1>
					<p className="text-xs text-[#555]">
						Update your application&apos;s name, description, and redirect URIs.
					</p>
				</div>

				<form onSubmit={handleSave} className="space-y-7 mb-16">
					{/* Name */}
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
							className="w-full bg-[#0d0d0d] border border-[#1e1e1e] focus:border-[#60a5fa]/50 outline-none text-sm text-[#e8e8e8] placeholder:text-[#333] px-3 py-2.5 transition-colors"
						/>
					</div>

					{/* Description */}
					<div>
						<label
							htmlFor="app-description"
							className="block text-[10px] tracking-widest uppercase text-[#666] mb-2"
						>
							Description{" "}
							<span className="text-[#3a3a3a] normal-case">optional</span>
						</label>
						<textarea
							id="app-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							maxLength={300}
							className="w-full bg-[#0d0d0d] border border-[#1e1e1e] focus:border-[#60a5fa]/50 outline-none text-sm text-[#e8e8e8] placeholder:text-[#333] px-3 py-2.5 transition-colors resize-none"
						/>
					</div>

					{/* Redirect URIs */}
					<div>
						<p className="block text-[10px] tracking-widest uppercase text-[#666] mb-2">
							Redirect URIs <span className="text-[#f43f5e]">*</span>
						</p>
						<div className="space-y-2">
							{redirectUris.map((uri, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: redirect URI list is index-ordered by design
								<div key={i} className="flex items-center gap-2">
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

					{/* Status messages */}
					{error && (
						<div className="flex items-start gap-2 border border-[#f43f5e]/30 bg-[#f43f5e]/05 px-3 py-2">
							<AlertTriangle className="size-3 text-[#f43f5e] mt-0.5 shrink-0" />
							<p className="text-xs text-[#f43f5e]">{error}</p>
						</div>
					)}
					{success && <p className="text-xs text-[#4ade80]">Settings saved.</p>}

					{/* Save */}
					<div className="flex items-center gap-3">
						<button
							type="submit"
							disabled={isSaving}
							className="flex items-center gap-2 text-xs border border-[#60a5fa]/40 bg-[#60a5fa]/10 text-[#60a5fa] hover:bg-[#60a5fa]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-4 py-2"
						>
							{isSaving ? (
								<>
									<Loader2 className="size-3 animate-spin" />
									Saving…
								</>
							) : (
								"Save Changes"
							)}
						</button>
					</div>
				</form>

				{/* Danger zone */}
				<div className="border border-[#f43f5e]/20 bg-[#0d0d0d]">
					<div className="px-5 py-4 border-b border-[#f43f5e]/10">
						<h2 className="text-[10px] tracking-widest uppercase text-[#f43f5e]">
							Danger Zone
						</h2>
					</div>
					<div className="px-5 py-4">
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-xs font-semibold text-[#c8c8c8] mb-1">
									Delete this application
								</p>
								<p className="text-xs text-[#555]">
									Permanently deletes the app, its credentials, and all
									associated data from WorkOS. This cannot be undone.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setShowDeleteConfirm(true)}
								className="shrink-0 text-[10px] border border-[#f43f5e]/30 text-[#f43f5e] hover:bg-[#f43f5e]/10 transition-colors px-3 py-1.5"
							>
								Delete App
							</button>
						</div>

						{showDeleteConfirm && (
							<div className="mt-5 border border-[#f43f5e]/20 bg-[#0a0a0a] p-4 space-y-3">
								<p className="text-xs text-[#888]">
									Type{" "}
									<code className="text-[#e8e8e8] bg-[#1a1a1a] px-1">
										{typedApp.name}
									</code>{" "}
									to confirm deletion:
								</p>
								<input
									type="text"
									value={deleteConfirmText}
									onChange={(e) => setDeleteConfirmText(e.target.value)}
									placeholder={typedApp.name}
									className="w-full bg-[#0d0d0d] border border-[#2a2a2a] focus:border-[#f43f5e]/50 outline-none text-xs text-[#e8e8e8] px-3 py-2 transition-colors"
								/>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={handleDelete}
										disabled={deleteConfirmText !== typedApp.name || isDeleting}
										className="flex items-center gap-1.5 text-xs border border-[#f43f5e]/40 bg-[#f43f5e]/10 text-[#f43f5e] hover:bg-[#f43f5e]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-3 py-1.5"
									>
										{isDeleting ? (
											<>
												<Loader2 className="size-3 animate-spin" />
												Deleting…
											</>
										) : (
											"Confirm Delete"
										)}
									</button>
									<button
										type="button"
										onClick={() => {
											setShowDeleteConfirm(false);
											setDeleteConfirmText("");
										}}
										className="text-xs text-[#444] hover:text-[#888] transition-colors px-2 py-1.5"
									>
										Cancel
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</main>
		</div>
	);
}

function SettingsHeader({
	appId,
	appName,
}: {
	appId: string;
	appName: string;
}) {
	return (
		<header className="border-b border-[#1e1e1e] px-6 py-3 flex items-center justify-between bg-[#0d0d0d]">
			<div className="flex items-center gap-4">
				<Link
					href={`/console/apps/${appId}`}
					className="flex items-center gap-1.5 text-xs text-[#666] hover:text-[#e8e8e8] transition-colors"
				>
					<ArrowLeft className="size-3" />
					<span className="truncate max-w-32">{appName}</span>
				</Link>
				<div className="w-px h-4 bg-[#2a2a2a]" />
				<div className="flex items-center gap-2">
					<Terminal className="size-3.5 text-[#888]" />
					<span className="text-xs font-semibold tracking-widest uppercase text-[#888]">
						settings
					</span>
				</div>
			</div>
		</header>
	);
}
