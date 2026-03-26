"use client";

import { Authenticated, useAction, useQuery } from "convex/react";
import {
	AlertTriangle,
	ArrowLeft,
	CornerDownLeft,
	Loader2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { cx, r } from "../../../_classes";
import { GsapPressLink } from "../../../gsap-press-link";

function tryNormalizeOrigin(raw: string): string | null {
	const s = raw.trim();
	if (!s) return null;
	try {
		const url = new URL(s.includes("://") ? s : `https://${s}`);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.origin;
	} catch {
		return null;
	}
}

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
	const [domains, setDomains] = useState<string[]>([""]);
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

	useEffect(() => {
		if (!app) return;
		const typedApp = app as {
			name: string;
			domains: string[];
			redirectUri: Array<{ uri: string; default: boolean }>;
		};
		setName(typedApp.name);
		const d = typedApp.domains ?? [];
		setDomains(d.length > 0 ? d : [""]);
		setRedirectUris(
			typedApp.redirectUri.length > 0
				? typedApp.redirectUri.map((u) => u.uri)
				: [""],
		);
	}, [app]);

	const addDomain = () => setDomains((prev) => [...prev, ""]);
	const removeDomain = (i: number) =>
		setDomains((prev) => prev.filter((_, idx) => idx !== i));
	const updateDomain = (i: number, val: string) =>
		setDomains((prev) => prev.map((u, idx) => (idx === i ? val : u)));

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
		const domainTokens = domains.map((d) => d.trim()).filter(Boolean);
		for (const d of domainTokens) {
			if (!tryNormalizeOrigin(d)) {
				setError(`Invalid domain or origin: ${d}`);
				return;
			}
		}
		const normalizedDomains = domainTokens
			.map((d) => tryNormalizeOrigin(d))
			.filter((x): x is string => x !== null);
		const seen = new Set<string>();
		const uniqueDomains = normalizedDomains.filter((d) => {
			if (seen.has(d)) return false;
			seen.add(d);
			return true;
		});

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
				domains: uniqueDomains,
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
			<div className="flex min-h-screen items-center justify-center">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (app === null) {
		return (
			<div className={cx.page}>
				<SettingsHeader appId={appId} appName="Not found" />
				<main className="flex-1 px-8 py-10">
					<p className="text-sm text-destructive">App not found.</p>
				</main>
			</div>
		);
	}

	const typedApp = app as { name: string };

	return (
		<div className={cx.page}>
			<SettingsHeader appId={appId} appName={typedApp.name} />

			<main className="flex min-h-0 flex-1 flex-col">
				<form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
					<div className="grid min-h-0 flex-1 grid-cols-2">
						<div className="min-h-0 overflow-y-auto px-8 py-8 sm:px-10">
							<label htmlFor="app-name" className={cx.label}>
								Name of the application{" "}
								<span className="text-destructive">*</span>
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
								className={cx.input}
							/>
						</div>

						<div className="min-h-0 space-y-8 overflow-y-auto px-8 py-8 sm:px-10">
							<div>
								<p className={cx.sectionLabel}>Add domain</p>
								<p className={cx.sectionHint}>
									Where your frontend app is running (the browser side).
								</p>
								<div className="mt-3 space-y-2">
									{domains.map((d, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: domain list is index-ordered by design
										<div key={i} className="flex items-center gap-3">
											<input
												type="text"
												value={d}
												onChange={(e) => {
													updateDomain(i, e.target.value);
													if (error) setError(null);
												}}
												placeholder="https://localhost:3000"
												className={cx.input}
											/>
											{domains.length > 1 && (
												<button
													type="button"
													onClick={() => removeDomain(i)}
													className={cx.textActionDanger}
												>
													Remove
												</button>
											)}
										</div>
									))}
								</div>
								<button
									type="button"
									onClick={addDomain}
									className={`mt-3 ${cx.textAction}`}
								>
									Add domain
								</button>
							</div>

							<div>
								<p className={cx.sectionLabel}>
									Redirect URIs <span className="text-destructive">*</span>
								</p>
								<p className={cx.sectionHint}>
									Where users are sent after they log in.
								</p>
								<div className="mt-3 space-y-2">
									{redirectUris.map((uri, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: redirect URI list is index-ordered by design
										<div key={i} className="flex items-center gap-3">
											<div className={cx.inputRow}>
												<span className="shrink-0 bg-muted/50 px-2.5 py-2 font-mono text-[10px] text-muted-foreground">
													{i === 0 ? "default" : `uri ${i + 1}`}
												</span>
												<input
													type="url"
													value={uri}
													onChange={(e) => {
														updateUri(i, e.target.value);
														if (error) setError(null);
													}}
													placeholder="https://yourapp.com/auth/callback"
													className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
												/>
											</div>
											{redirectUris.length > 1 && (
												<button
													type="button"
													onClick={() => removeUri(i)}
													className={cx.textActionDanger}
												>
													Remove
												</button>
											)}
										</div>
									))}
								</div>
								<button
									type="button"
									onClick={addUri}
									className={`mt-3 ${cx.textAction}`}
								>
									Add redirect URI
								</button>
							</div>
						</div>
					</div>

					<div className="shrink-0 border-border/50 border-t px-8 py-4 sm:px-10">
						<div
							className={`overflow-hidden border border-destructive/25 bg-destructive/5 ${r.main}`}
						>
							<div className="border-b border-destructive/15 px-5 py-3">
								<h2 className="text-sm font-semibold text-destructive">
									Danger zone
								</h2>
							</div>
							<div className="px-5 py-4">
								<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
									<div>
										<p className="mb-1 text-sm font-semibold text-foreground">
											Delete this application
										</p>
										<p className="text-xs leading-relaxed text-muted-foreground">
											Permanently deletes the app, its credentials, and all
											associated data from WorkOS. This cannot be undone.
										</p>
									</div>
									<button
										type="button"
										onClick={() => setShowDeleteConfirm(true)}
										className={`${cx.dangerBtn} shrink-0`}
									>
										Delete app
									</button>
								</div>

								{showDeleteConfirm && (
									<div
										className={`mt-6 space-y-3 border border-destructive/20 bg-background/80 p-4 ${r.main}`}
									>
										<p className="text-xs text-muted-foreground">
											Type{" "}
											<code
												className={`bg-muted px-1.5 py-0.5 font-mono text-foreground ${r.small}`}
											>
												{typedApp.name}
											</code>{" "}
											to confirm deletion:
										</p>
										<input
											type="text"
											value={deleteConfirmText}
											onChange={(e) => setDeleteConfirmText(e.target.value)}
											placeholder={typedApp.name}
											className={cx.input}
										/>
										<div className="flex flex-wrap items-center gap-2">
											<button
												type="button"
												onClick={handleDelete}
												disabled={
													deleteConfirmText !== typedApp.name || isDeleting
												}
												className={cx.dangerBtn}
											>
												{isDeleting ? (
													<>
														<Loader2 className="size-3.5 animate-spin" />
														Deleting…
													</>
												) : (
													"Confirm delete"
												)}
											</button>
											<button
												type="button"
												onClick={() => {
													setShowDeleteConfirm(false);
													setDeleteConfirmText("");
												}}
												className={`${cx.ghostBtn} px-3 py-2`}
											>
												Cancel
											</button>
										</div>
									</div>
								)}
							</div>
						</div>
					</div>

					{error && (
						<div className="shrink-0 border-border/50 border-t px-8 py-3 sm:px-10">
							<div className={cx.alertError}>
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<p>{error}</p>
							</div>
						</div>
					)}
					{success && (
						<div className="shrink-0 border-border/50 border-t px-8 py-2 sm:px-10">
							<p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
								Settings saved.
							</p>
						</div>
					)}

					<div className="mt-auto flex shrink-0 items-center justify-end gap-3 border-border/50 border-t bg-background/95 px-8 py-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:px-10">
						<Link href={`/console/apps/${appId}`} className={cx.secondaryBtn}>
							Cancel
						</Link>
						<button type="submit" disabled={isSaving} className={cx.primaryBtn}>
							{isSaving ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Saving…
								</>
							) : (
								<>
									Save
									<span className={cx.returnKeyCap} aria-hidden>
										<CornerDownLeft className="size-4" strokeWidth={2.25} />
									</span>
								</>
							)}
						</button>
					</div>
				</form>
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
		<header className={cx.header}>
			<div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-8">
				<GsapPressLink
					href={`/console/apps/${appId}`}
					className={cx.linkBack}
					scale={0.99}
				>
					<ArrowLeft className="size-4 shrink-0" />
					<span className="max-w-[10rem] truncate">{appName}</span>
				</GsapPressLink>
				<p className="min-w-0 text-base font-semibold tracking-tight text-foreground">
					App settings
				</p>
			</div>
		</header>
	);
}
