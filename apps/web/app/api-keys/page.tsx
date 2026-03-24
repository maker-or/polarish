"use client";

import { Authenticated, useMutation, useQuery } from "convex/react";
import {
	AlertTriangle,
	Check,
	Copy,
	KeyRound,
	Plus,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface CreatedKeyInfo {
	publicId: string;
	fullKey: string;
	name: string;
}

export default function ApiKeysPage() {
	const [showForm, setShowForm] = useState(false);
	const [keyName, setKeyName] = useState("");
	const [createdKey, setCreatedKey] = useState<CreatedKeyInfo | null>(null);
	const [copied, setCopied] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const apiKeys = useQuery(api.secert.listApiKeys) ?? [];
	const generateKey = useMutation(api.secert.genrateKey);
	const deleteKey = useMutation(api.secert.deleteApiKey);

	const handleShowForm = () => {
		setShowForm(true);
		setError(null);
		setKeyName("");
	};

	const handleCancel = () => {
		setShowForm(false);
		setKeyName("");
		setError(null);
	};

	const handleContinue = async () => {
		if (!keyName.trim()) {
			setError("Please enter a name for your API key.");
			return;
		}
		setIsCreating(true);
		setError(null);
		try {
			const result = await generateKey({ name: keyName.trim() });
			setCreatedKey({
				publicId: result.publicId,
				fullKey: result.fullKey,
				name: keyName.trim(),
			});
			setShowForm(false);
			setKeyName("");
		} catch (err: unknown) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to create API key. Please try again.",
			);
		} finally {
			setIsCreating(false);
		}
	};

	const handleCopyKey = (text: string) => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleDelete = async (keyId: Id<"secretkey">) => {
		try {
			await deleteKey({ keyId });
		} catch (err) {
			console.error("Failed to delete key:", err);
		}
	};

	const maskKey = (prefix: string, publicId: string) => {
		return `${prefix}${publicId}${"•".repeat(12)}`;
	};

	return (
		<Authenticated>
			<AuthenticatedLayout>
				<main className="w-full px-10 py-10 max-w-5xl">
					{/* Page heading */}
					<div className="mb-6">
						<div className="flex items-center gap-2 mb-1">
							<KeyRound className="size-5 text-foreground" />
							<h2 className="text-xl font-semibold">API Keys</h2>
						</div>
						<p className="text-sm text-muted-foreground mt-1">
							Manage secret keys used to authenticate requests to your
							application. Keep your keys secure — never expose them in
							client-side code or public repositories.
						</p>
					</div>

					<Separator className="mb-6" />

					{/* Create new key button */}
					{!showForm && (
						<Button onClick={handleShowForm} className="mb-6 cursor-pointer">
							<Plus className="size-4" />
							Create New Key
						</Button>
					)}

					{/* Inline form — renders below the button, no dialog */}
					{showForm && (
						<Card className="mb-6 border-border">
							<CardContent className="pt-5 pb-5">
								<p className="text-sm font-medium mb-1">New API Key</p>
								<p className="text-xs text-muted-foreground mb-4">
									Give your key a descriptive name so you can identify it later
									(e.g.&nbsp;
									<span className="font-mono">Production App</span> or{" "}
									<span className="font-mono">CI Pipeline</span>
									).
								</p>
								<label
									className="text-xs font-medium text-foreground block mb-1.5"
									htmlFor="key-name"
								>
									Key name
								</label>
								<Input
									id="key-name"
									placeholder="e.g. Production App"
									value={keyName}
									onChange={(e) => {
										setKeyName(e.target.value);
										if (error) setError(null);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleContinue();
										if (e.key === "Escape") handleCancel();
									}}
									className="mb-2 max-w-sm"
									autoFocus
								/>
								{error && (
									<p className="text-xs text-destructive mb-3">{error}</p>
								)}
								<div className="flex items-center gap-2 mt-3">
									<Button
										variant="outline"
										size="sm"
										onClick={handleCancel}
										className="cursor-pointer"
										disabled={isCreating}
									>
										Cancel
									</Button>
									<Button
										size="sm"
										onClick={handleContinue}
										disabled={isCreating || !keyName.trim()}
										className="cursor-pointer"
									>
										{isCreating ? "Creating…" : "Continue"}
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Newly created key — shown once */}
					{createdKey && (
						<Card className="mb-6 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30">
							<CardContent className="pt-5 pb-5">
								<div className="flex items-start gap-2 mb-3">
									<AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
									<div>
										<p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
											Save your key — it won&apos;t be shown again
										</p>
										<p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
											Copy and store{" "}
											<span className="font-medium">{createdKey.name}</span>{" "}
											somewhere safe. Once you close this notice you cannot
											retrieve the full key.
										</p>
									</div>
								</div>

								<div className="flex items-center gap-2 mt-3">
									<code className="flex-1 rounded-none bg-amber-100 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 px-3 py-2 text-xs font-mono break-all text-amber-900 dark:text-amber-100 select-all">
										{createdKey.fullKey}
									</code>
									<Button
										variant="outline"
										size="icon-sm"
										onClick={() => handleCopyKey(createdKey.fullKey)}
										className="cursor-pointer shrink-0 border-amber-300 dark:border-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/50"
										title="Copy key"
									>
										{copied ? (
											<Check className="size-3.5 text-green-600" />
										) : (
											<Copy className="size-3.5 text-amber-700 dark:text-amber-300" />
										)}
									</Button>
								</div>

								<Button
									variant="ghost"
									size="xs"
									onClick={() => setCreatedKey(null)}
									className="mt-3 cursor-pointer text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
								>
									I&apos;ve saved my key, dismiss this
								</Button>
							</CardContent>
						</Card>
					)}

					{/* Keys table */}
					{apiKeys.length > 0 ? (
						<div className="rounded-none border border-border overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow className="bg-muted/40 hover:bg-muted/40">
										<TableHead className="font-semibold text-xs">
											Name
										</TableHead>
										<TableHead className="font-semibold text-xs">Key</TableHead>
										<TableHead className="font-semibold text-xs">
											Created
										</TableHead>
										<TableHead className="font-semibold text-xs text-right">
											Actions
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{apiKeys.map((apiKey) => (
										<TableRow key={apiKey._id}>
											<TableCell className="font-medium text-xs">
												{apiKey.name}
											</TableCell>
											<TableCell>
												<code className="bg-muted px-2 py-1 text-xs font-mono rounded-none">
													{maskKey(apiKey.prefix, apiKey.publicId)}
												</code>
											</TableCell>
											<TableCell className="text-xs text-muted-foreground">
												{new Date(apiKey.createdAt).toLocaleDateString(
													"en-US",
													{
														year: "numeric",
														month: "short",
														day: "numeric",
													},
												)}
											</TableCell>
											<TableCell className="text-right">
												<Button
													variant="ghost"
													size="icon-sm"
													onClick={() =>
														handleDelete(apiKey._id as Id<"secretkey">)
													}
													className="cursor-pointer"
													title="Revoke key"
												>
													<Trash2 className="size-3.5 text-destructive" />
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						!showForm && (
							<div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-none">
								<KeyRound className="size-8 text-muted-foreground/40 mb-3" />
								<p className="text-sm font-medium text-muted-foreground">
									No API keys yet
								</p>
								<p className="text-xs text-muted-foreground/70 mt-1">
									Create your first key to start authenticating requests.
								</p>
							</div>
						)
					)}
				</main>
			</AuthenticatedLayout>
		</Authenticated>
	);
}
