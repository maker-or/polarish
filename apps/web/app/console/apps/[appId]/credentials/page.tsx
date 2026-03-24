"use client";

import { Authenticated, useAction, useQuery } from "convex/react";
import {
	AlertTriangle,
	ArrowLeft,
	Check,
	Copy,
	Eye,
	EyeOff,
	Loader2,
	Plus,
	ShieldAlert,
	Terminal,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

interface SecretMeta {
	id: string;
	name: string;
	lastFour: string;
	createdAt: string;
}

interface NewSecretInfo {
	secretId: string;
	secret: string;
	lastFour: string;
}

export default function CredentialsPage() {
	return (
		<Authenticated>
			<CredentialsView />
		</Authenticated>
	);
}

function CredentialsView() {
	const params = useParams();
	const appId = params.appId as Id<"consoleApp">;

	const app = useQuery(api.console.getApp, { appId });
	const listClientSecrets = useAction(api.console.listClientSecrets);
	const createClientSecret = useAction(api.console.createClientSecret);
	const revokeClientSecret = useAction(api.console.revokeClientSecret);

	const [secrets, setSecrets] = useState<SecretMeta[] | null>(null);
	const [newSecret, setNewSecret] = useState<NewSecretInfo | null>(null);
	const [showNewSecret, setShowNewSecret] = useState(false);
	const [newSecretName, setNewSecretName] = useState("");
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const [isLoadingSecrets, setIsLoadingSecrets] = useState(false);
	const [copied, setCopied] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const isMountedRef = useRef(true);
	const copyResetTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			if (copyResetTimeoutRef.current !== null) {
				window.clearTimeout(copyResetTimeoutRef.current);
			}
		};
	}, []);

	const copyToClipboard = (text: string, key: string) => {
		navigator.clipboard.writeText(text);
		setCopied(key);
		if (copyResetTimeoutRef.current !== null) {
			window.clearTimeout(copyResetTimeoutRef.current);
		}
		copyResetTimeoutRef.current = window.setTimeout(() => {
			if (isMountedRef.current) setCopied(null);
		}, 2000);
	};

	const loadSecrets = useCallback(async () => {
		if (isMountedRef.current) setIsLoadingSecrets(true);
		try {
			const result = (await listClientSecrets({ appId })) as SecretMeta[];
			if (isMountedRef.current) setSecrets(result);
		} catch (err) {
			console.error("[credentials] listClientSecrets failed:", err);
			if (isMountedRef.current) setSecrets([]);
		} finally {
			if (isMountedRef.current) setIsLoadingSecrets(false);
		}
	}, [appId, listClientSecrets]);

	useEffect(() => {
		if (app) {
			void loadSecrets();
		}
	}, [app, loadSecrets]);

	const handleCreateSecret = async () => {
		const trimmed = newSecretName.trim();
		if (!trimmed) {
			setError("Secret name is required.");
			return;
		}
		setIsCreating(true);
		setError(null);
		try {
			const result = (await createClientSecret({
				appId,
				name: trimmed,
			})) as NewSecretInfo;
			if (!isMountedRef.current) return;
			setNewSecret(result);
			setShowNewSecret(true);
			setNewSecretName("");
			setShowCreateForm(false);
			await loadSecrets();
		} catch (err) {
			if (isMountedRef.current) {
				setError(err instanceof Error ? err.message : "Failed to create secret.");
			}
		} finally {
			if (isMountedRef.current) setIsCreating(false);
		}
	};

	const handleRevoke = async (secretId: string) => {
		try {
			await revokeClientSecret({ appId, secretId });
			if (isMountedRef.current) {
				setSecrets((prev) => prev?.filter((s) => s.id !== secretId) ?? null);
			}
		} catch (err) {
			if (isMountedRef.current) {
				setError(err instanceof Error ? err.message : "Failed to revoke secret.");
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
				<CredentialsHeader appId={String(appId)} appName="Not found" />
				<main className="flex-1 px-8 py-10">
					<p className="text-sm text-[#f43f5e]">App not found.</p>
				</main>
			</div>
		);
	}

	const typedApp = app as {
		name: string;
		workosClientId: string;
	};

	return (
		<div className="min-h-screen flex flex-col">
			<CredentialsHeader appId={String(appId)} appName={typedApp.name} />

			<main className="flex-1 px-8 py-10 max-w-3xl w-full">
				<div className="mb-8">
					<h1 className="text-lg font-bold text-[#e8e8e8] tracking-tight mb-1">
						Credentials
					</h1>
					<p className="text-xs text-[#555]">
						Your Client ID is public. Client Secrets are shown once on creation
						— store them securely.
					</p>
				</div>

				{/* Client ID */}
				<section className="mb-10">
					<h2 className="text-[10px] tracking-widest uppercase text-[#555] mb-3">
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
					<p className="text-[10px] text-[#3a3a3a] mt-2">
						Safe to include in client-side code and public repositories.
					</p>
				</section>

				{/* New secret reveal */}
				{newSecret && (
					<div className="mb-8 border border-[#f59e0b]/30 bg-[#f59e0b]/05 p-5">
						<div className="flex items-start gap-2 mb-4">
							<ShieldAlert className="size-4 text-[#f59e0b] mt-0.5 shrink-0" />
							<div>
								<p className="text-xs font-semibold text-[#f59e0b] mb-0.5">
									Copy this secret now — it won&apos;t be shown again
								</p>
								<p className="text-[10px] text-[#8a6a2a]">
									Store it somewhere safe like a password manager or secrets
									vault.
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<div className="flex-1 flex items-center border border-[#f59e0b]/20 bg-[#0a0a0a]">
								<code className="flex-1 px-3 py-2.5 text-xs font-mono text-[#e8e8e8] select-all break-all">
									{showNewSecret ? newSecret.secret : "•".repeat(40)}
								</code>
								<button
									type="button"
									onClick={() => setShowNewSecret((v) => !v)}
									className="px-2 text-[#555] hover:text-[#888] transition-colors"
								>
									{showNewSecret ? (
										<EyeOff className="size-3.5" />
									) : (
										<Eye className="size-3.5" />
									)}
								</button>
							</div>
							<button
								type="button"
								onClick={() => copyToClipboard(newSecret.secret, "new-secret")}
								className="size-9 border border-[#f59e0b]/30 bg-[#f59e0b]/05 hover:bg-[#f59e0b]/10 flex items-center justify-center transition-colors"
							>
								{copied === "new-secret" ? (
									<Check className="size-3 text-[#4ade80]" />
								) : (
									<Copy className="size-3 text-[#f59e0b]" />
								)}
							</button>
						</div>
						<button
							type="button"
							onClick={() => setNewSecret(null)}
							className="mt-3 text-[10px] text-[#666] hover:text-[#aaa] transition-colors"
						>
							I&apos;ve saved my secret, dismiss this
						</button>
					</div>
				)}

				{/* Client Secrets */}
				<section>
					<div className="flex items-center justify-between mb-3">
						<h2 className="text-[10px] tracking-widest uppercase text-[#555]">
							Client Secrets
						</h2>
						{!showCreateForm && (
							<button
								type="button"
								onClick={() => {
									setShowCreateForm(true);
									setError(null);
								}}
								className="flex items-center gap-1.5 text-[10px] text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
							>
								<Plus className="size-3" />
								New Secret
							</button>
						)}
					</div>

					{/* Create form */}
					{showCreateForm && (
						<div className="mb-4 border border-[#1e1e1e] bg-[#0d0d0d] p-4 space-y-3">
							<p className="text-xs text-[#555]">
								Give this secret a name to identify it later (e.g.{" "}
								<code className="text-[#e8e8e8] bg-[#1a1a1a] px-1">
									production
								</code>
								,{" "}
								<code className="text-[#e8e8e8] bg-[#1a1a1a] px-1">
									staging
								</code>
								).
							</p>
							<div className="flex items-center gap-2">
								<input
									type="text"
									value={newSecretName}
									onChange={(e) => {
										setNewSecretName(e.target.value);
										if (error) setError(null);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter") void handleCreateSecret();
										if (e.key === "Escape") setShowCreateForm(false);
									}}
									placeholder="e.g. production"
									className="flex-1 bg-[#080808] border border-[#1e1e1e] focus:border-[#60a5fa]/50 outline-none text-xs text-[#e8e8e8] placeholder:text-[#2a2a2a] px-3 py-2 transition-colors"
								/>
								<button
									type="button"
									onClick={() => void handleCreateSecret()}
									disabled={isCreating || !newSecretName.trim()}
									className="flex items-center gap-1.5 text-xs border border-[#60a5fa]/40 bg-[#60a5fa]/10 text-[#60a5fa] hover:bg-[#60a5fa]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-3 py-2"
								>
									{isCreating ? (
										<Loader2 className="size-3 animate-spin" />
									) : (
										<Plus className="size-3" />
									)}
									Create
								</button>
								<button
									type="button"
									onClick={() => setShowCreateForm(false)}
									className="text-xs text-[#444] hover:text-[#888] transition-colors px-2 py-2"
								>
									Cancel
								</button>
							</div>
						</div>
					)}

					{error && (
						<div className="flex items-start gap-2 border border-[#f43f5e]/30 bg-[#f43f5e]/05 px-3 py-2 mb-3">
							<AlertTriangle className="size-3 text-[#f43f5e] mt-0.5 shrink-0" />
							<p className="text-xs text-[#f43f5e]">{error}</p>
						</div>
					)}

					{/* Secrets list */}
					{isLoadingSecrets ? (
						<div className="space-y-px">
							{[0, 1].map((i) => (
								<div
									key={i}
									className="bg-[#0d0d0d] border border-[#1a1a1a] p-4 animate-pulse"
								>
									<div className="h-2.5 bg-[#1e1e1e] rounded-none w-40" />
								</div>
							))}
						</div>
					) : secrets === null || secrets.length === 0 ? (
						<div className="border border-dashed border-[#1e1e1e] flex flex-col items-center justify-center py-12 text-center">
							<p className="text-xs text-[#3a3a3a]">No client secrets yet.</p>
							<p className="text-[10px] text-[#2a2a2a] mt-1">
								Create one to authenticate your OAuth app.
							</p>
						</div>
					) : (
						<div className="space-y-px">
							{secrets.map((secret) => (
								<div
									key={secret.id}
									className="flex items-center justify-between bg-[#0d0d0d] border border-[#1a1a1a] px-4 py-3"
								>
									<div>
										<p className="text-xs text-[#c8c8c8] font-semibold mb-0.5">
											{secret.name}
										</p>
										<p className="text-[10px] text-[#444] font-mono">
											…{secret.lastFour} · Created{" "}
											{new Date(secret.createdAt).toLocaleDateString("en-US", {
												year: "numeric",
												month: "short",
												day: "numeric",
											})}
										</p>
									</div>
									<button
										type="button"
										onClick={() => void handleRevoke(secret.id)}
										className="flex items-center gap-1.5 text-[10px] text-[#333] hover:text-[#f43f5e] border border-transparent hover:border-[#f43f5e]/20 hover:bg-[#f43f5e]/05 transition-all px-2 py-1"
									>
										<Trash2 className="size-3" />
										Revoke
									</button>
								</div>
							))}
						</div>
					)}
				</section>
			</main>

			<footer className="border-t border-[#1e1e1e] px-8 py-4 bg-[#0d0d0d]">
				<span className="text-[10px] text-[#444] tracking-widest uppercase">
					pro gateway · credentials
				</span>
			</footer>
		</div>
	);
}

function CredentialsHeader({
	appId,
	appName,
}: {
	appId: string;
	appName: string;
}) {
	return (
		<header className="border-b border-[#1e1e1e] px-6 py-3 flex items-center gap-4 bg-[#0d0d0d]">
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
					credentials
				</span>
			</div>
		</header>
	);
}
