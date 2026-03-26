"use client";

import { Authenticated, useAction } from "convex/react";
import {
	AlertTriangle,
	ArrowLeft,
	CornerDownLeft,
	Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import { cx } from "../../_classes";
import { GsapPressLink } from "../../gsap-press-link";

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
	const [domains, setDomains] = useState<string[]>([""]);
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

	const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
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

		setIsCreating(true);
		setError(null);
		try {
			const result = (await createApp({
				name: trimmedName,
				domains: uniqueDomains,
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
		<div className={cx.page}>
			<header className={cx.header}>
				<div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-8">
					<GsapPressLink
						href="/console/apps"
						className={cx.linkBack}
						scale={0.99}
					>
						<ArrowLeft className="size-4 shrink-0" />
						<span>Apps</span>
					</GsapPressLink>
					<p className="min-w-0 text-base font-semibold tracking-tight text-foreground">
						Create OAuth application
					</p>
				</div>
			</header>

			<main className="flex min-h-0 flex-1 flex-col">
				<form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
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
								placeholder="My production app"
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
										<div
											key={`domain-${i}`}
											className="flex items-center gap-3"
										>
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
										<div
											key={`${i}-${uri}`}
											className="flex items-center gap-3"
										>
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

					{error && (
						<div className="shrink-0 border-border/50 border-t px-8 py-3 sm:px-10">
							<div className={cx.alertError}>
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<p>{error}</p>
							</div>
						</div>
					)}

					<div className="mt-auto flex shrink-0 items-center justify-end gap-3 border-border/50 border-t bg-background/95 px-8 py-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:px-10">
						<Link href="/console/apps" className={cx.secondaryBtn}>
							Cancel
						</Link>
						<button
							type="submit"
							disabled={isCreating}
							className={cx.primaryBtn}
						>
							{isCreating ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Creating…
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
