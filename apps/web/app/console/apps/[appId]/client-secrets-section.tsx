"use client";

import {
	AlertTriangle,
	Check,
	Copy,
	Eye,
	EyeOff,
	Key,
	Plus,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { cx, press } from "../../_classes";

const SECRET_CHARS =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Random alphanumeric (client-secret–shaped suffix). */
function randomAlphanumeric(length: number): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let out = "";
	for (let i = 0; i < length; i++) {
		out += SECRET_CHARS[bytes[i] % SECRET_CHARS.length];
	}
	return out;
}

/** Looks like a typical API client secret: `sk_live_` + long opaque suffix (UI mock only). */
function generateClientSecretLike(): string {
	return `sk_live_${randomAlphanumeric(56)}`;
}

export interface SecretMeta {
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

export function ClientSecretsSection({
	appId: _appId,
	isAdmin,
}: {
	appId: Id<"consoleApp">;
	isAdmin: boolean;
}) {
	const [secrets, setSecrets] = useState<SecretMeta[]>([]);
	const [newSecret, setNewSecret] = useState<NewSecretInfo | null>(null);
	const [showNewSecret, setShowNewSecret] = useState(false);
	const [newSecretName, setNewSecretName] = useState("");
	const [showCreateForm, setShowCreateForm] = useState(false);
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

	const handleCreateSecret = () => {
		const trimmed = newSecretName.trim();
		if (!trimmed) {
			setError("Secret name is required.");
			return;
		}
		setError(null);
		const secret = generateClientSecretLike();
		const id = `sec_${randomAlphanumeric(24)}`;
		const lastFour = secret.slice(-4);
		const createdAt = new Date().toISOString();
		setNewSecret({ secretId: id, secret, lastFour });
		setShowNewSecret(true);
		setNewSecretName("");
		setShowCreateForm(false);
		setSecrets((prev) => {
			const row: SecretMeta = {
				id,
				name: trimmed,
				lastFour,
				createdAt,
			};
			return [...prev.filter((s) => s.id !== id), row];
		});
	};

	const handleRevoke = (secretId: string) => {
		setSecrets((prev) => prev.filter((s) => s.id !== secretId));
	};

	return (
		<section id="client-secrets" className="scroll-mt-8">
			<p className="mb-4 text-xs leading-relaxed text-muted-foreground">
				Client secrets are private — never expose them in client-side code. Each
				secret is shown once when created; store it in a secrets manager.
			</p>

			{newSecret && (
				<div className="animate-client-secret-reveal mb-8 rounded-none border border-border/60 bg-card/40 p-5 shadow-sm">
					<div className="mb-4 flex items-start gap-2">
						<Key className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
						<div>
							<p className="mb-0.5 text-sm font-semibold text-foreground">
								Copy this secret now — it won&apos;t be shown again
							</p>
							<p className="text-xs text-muted-foreground">
								Store it somewhere safe like a password manager or secrets
								vault.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<div className="flex flex-1 items-center overflow-hidden rounded-none border border-border/60 bg-muted/40">
							<code className="flex-1 break-all px-3 py-2.5 font-mono text-xs text-foreground select-all">
								{showNewSecret
									? newSecret.secret
									: "•".repeat(Math.min(64, newSecret.secret.length))}
							</code>
							<button
								type="button"
								onClick={() => setShowNewSecret((v) => !v)}
								className={`px-2 text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground ${press}`}
							>
								{showNewSecret ? (
									<EyeOff className="size-4" />
								) : (
									<Eye className="size-4" />
								)}
							</button>
						</div>
						<button
							type="button"
							onClick={() => copyToClipboard(newSecret.secret, "new-secret")}
							className={cx.iconCopyBtn}
						>
							{copied === "new-secret" ? (
								<Check className="size-4 text-emerald-500" />
							) : (
								<Copy className="size-4 text-muted-foreground" />
							)}
						</button>
					</div>
					<button
						type="button"
						onClick={() => setNewSecret(null)}
						className={`mt-3 font-medium ${cx.textAction}`}
					>
						I&apos;ve saved my secret, dismiss this
					</button>
				</div>
			)}

			<div className="mb-3 flex items-center justify-between gap-2">
				<h2 className="text-sm font-semibold text-foreground">
					Client secrets
				</h2>
				{isAdmin && !showCreateForm && (
					<button
						type="button"
						onClick={() => {
							setShowCreateForm(true);
							setError(null);
						}}
						className={cx.ghostBtnPrimary}
					>
						<Plus className="size-4" />
						New secret
					</button>
				)}
			</div>

			{isAdmin && showCreateForm && (
				<div className="mb-4 space-y-3 rounded-none border border-border/60 bg-card/50 p-4 shadow-sm">
					<p className="text-xs leading-relaxed text-muted-foreground">
						Give this secret a name to identify it later (e.g.{" "}
						<code className="rounded-none bg-muted px-1.5 py-0.5 font-mono text-foreground">
							production
						</code>
						,{" "}
						<code className="rounded-none bg-muted px-1.5 py-0.5 font-mono text-foreground">
							staging
						</code>
						).
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<input
							type="text"
							value={newSecretName}
							onChange={(e) => {
								setNewSecretName(e.target.value);
								if (error) setError(null);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateSecret();
								if (e.key === "Escape") setShowCreateForm(false);
							}}
							placeholder="e.g. production"
							className={`${cx.input} min-w-[12rem] flex-1`}
						/>
						<button
							type="button"
							onClick={handleCreateSecret}
							disabled={!newSecretName.trim()}
							className={`${cx.primaryBtn} disabled:active:scale-100`}
						>
							<Plus className="size-4" />
							Create
						</button>
						<button
							type="button"
							onClick={() => setShowCreateForm(false)}
							className={`${cx.ghostBtn} px-3 py-2`}
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			{error && (
				<div className={`${cx.alertError} mb-3`}>
					<AlertTriangle className="mt-0.5 size-4 shrink-0" />
					<p>{error}</p>
				</div>
			)}

			{secrets.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-none border border-dashed border-border/70 bg-muted/20 py-12 text-center">
					<p className="text-sm text-muted-foreground">
						No client secrets yet.
					</p>
					<p className="mt-1 text-xs text-muted-foreground/80">
						{isAdmin
							? "Create one to authenticate your OAuth app."
							: "Ask an org admin to create a client secret."}
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{secrets.map((secret) => (
						<div
							key={secret.id}
							className="flex items-center justify-between rounded-none border border-border/60 bg-card/40 px-4 py-3.5 shadow-sm transition-colors duration-150 ease-out hover:bg-muted/15"
						>
							<div className="min-w-0">
								<p className="mb-0.5 text-sm font-semibold text-foreground">
									{secret.name}
								</p>
								<p className="font-mono text-[11px] text-muted-foreground">
									…{secret.lastFour} · Created{" "}
									{new Date(secret.createdAt).toLocaleDateString("en-US", {
										year: "numeric",
										month: "short",
										day: "numeric",
									})}
								</p>
							</div>
							{isAdmin && (
								<button
									type="button"
									onClick={() => handleRevoke(secret.id)}
									className={cx.revokeBtn}
								>
									<Trash2 className="size-3.5" />
									Revoke
								</button>
							)}
						</div>
					))}
				</div>
			)}
		</section>
	);
}
