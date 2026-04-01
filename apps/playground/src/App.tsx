import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import {
	DEFAULT_PROMPT,
	type FinalResponse,
	getPlaygroundConfig,
	maskToken,
	runPlaygroundRequest,
	stringifyJson,
} from "./lib/playground-client";

type RunMode = "stream" | "batch" | null;

/**
 * This formats file sizes so the attachment list is easy to scan.
 */
function formatFileSize(size: number): string {
	if (size < 1024) {
		return `${size} B`;
	}

	if (size < 1024 * 1024) {
		return `${(size / 1024).toFixed(1)} KB`;
	}

	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		const parts = [error.name, error.message, error.stack];
		if (error.cause instanceof Error) {
			parts.push(`Cause: ${error.cause.name}: ${error.cause.message}`);
			if (error.cause.stack) {
				parts.push(error.cause.stack);
			}
		}

		return parts
			.filter(
				(part): part is string =>
					typeof part === "string" && part.trim().length > 0,
			)
			.join("\n\n");
	}

	if (typeof error === "string") {
		return error;
	}

	if (error && typeof error === "object") {
		return JSON.stringify(error, null, 2);
	}

	return "Request failed.";
}

function App() {
	const {
		baseUrl,
		accessToken,
		refreshToken,
		clientId,
		clientSecret,
		envError,
	} = getPlaygroundConfig();

	const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
	const [files, setFiles] = useState<File[]>([]);
	const [runMode, setRunMode] = useState<RunMode>(null);
	const [output, setOutput] = useState("");
	const [error, setError] = useState("");
	const [finalResponse, setFinalResponse] = useState<FinalResponse | null>(
		null,
	);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const finalJson = finalResponse ? stringifyJson(finalResponse) : "";

	const isLoading = runMode !== null;
	const canSubmit =
		(prompt.trim().length > 0 || files.length > 0) && !isLoading && !envError;

	const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
		const nextFiles = Array.from(event.target.files ?? []);
		setFiles((current) => {
			const seen = new Set(
				current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
			);
			const uniqueFiles = nextFiles.filter((file) => {
				const key = `${file.name}:${file.size}:${file.lastModified}`;
				if (seen.has(key)) {
					return false;
				}

				seen.add(key);
				return true;
			});

			return [...current, ...uniqueFiles];
		});
		event.target.value = "";
	};

	const removeFile = (indexToRemove: number) => {
		setFiles((current) =>
			current.filter((_, currentIndex) => currentIndex !== indexToRemove),
		);
	};

	const runRequest = async (stream: boolean) => {
		setRunMode(stream ? "stream" : "batch");
		setOutput("");
		setError("");
		setFinalResponse(null);

		try {
			const result = await runPlaygroundRequest({
				prompt,
				stream,
				files,
				onTextDelta: (delta) => {
					setOutput((current) => current + delta);
				},
			});

			setFinalResponse(result.finalResponse);
			setOutput(result.output);
		} catch (caughtError) {
			setError(getErrorMessage(caughtError));
		} finally {
			setRunMode(null);
		}
	};

	return (
		<main
			style={{
				minHeight: "100vh",
				background: "#0f1117",
				color: "#f5f7fb",
				fontFamily:
					'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
				padding: "32px 20px",
			}}
		>
			<div
				style={{
					maxWidth: 960,
					margin: "0 auto",
					display: "grid",
					gap: 16,
				}}
			>
				<section
					style={{
						border: "1px solid #252a35",
						borderRadius: 16,
						padding: 20,
						background: "#151923",
						display: "grid",
						gap: 12,
					}}
				>
					<div>
						<h1 style={{ margin: 0, fontSize: 24 }}>AI Playground</h1>
						<p style={{ margin: "8px 0 0", color: "#a7b0c0" }}>
							Local-only Vite app: loads `@hax/ai` via{" "}
							<code style={{ color: "#dfe6f3" }}>
								{
									"create({ accessToken, refreshToken, clientId, clientSecret, baseUrl })"
								}
							</code>{" "}
							from `apps/playground/src/.env`.
						</p>
					</div>

					<div
						style={{ color: "#a7b0c0", fontSize: 14, display: "grid", gap: 4 }}
					>
						<div>Base URL (VITE_MACHINE_BASE_URL): {baseUrl || "—"}</div>
						<div>
							Access token (VITE_MACHINE_ACCESS_TOKEN):{" "}
							{accessToken ? maskToken(accessToken) : "—"}
						</div>
						<div>
							Refresh token (VITE_MACHINE_REFRESH_TOKEN):{" "}
							{refreshToken ? maskToken(refreshToken) : "—"}
						</div>
						<div>
							Client ID (VITE_MACHINE_CLIENT_ID):{" "}
							{clientId ? maskToken(clientId) : "—"}
						</div>
						<div>
							Client secret (VITE_MACHINE_CLIENT_SECRET):{" "}
							{clientSecret ? maskToken(clientSecret) : "—"}
						</div>
					</div>

					<label style={{ display: "grid", gap: 8 }}>
						<span style={{ fontSize: 14, color: "#c4cbda" }}>Prompt</span>
						<textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							rows={8}
							placeholder="Ask the machine endpoint something..."
							style={{
								width: "100%",
								resize: "vertical",
								borderRadius: 12,
								border: "1px solid #30384a",
								background: "#0f1117",
								color: "#f5f7fb",
								padding: 14,
								font: "inherit",
								boxSizing: "border-box",
							}}
						/>
					</label>

					<div
						style={{
							display: "grid",
							gap: 10,
							borderRadius: 14,
							border: "1px solid #30384a",
							background:
								"linear-gradient(135deg, rgba(41,50,72,0.55), rgba(15,17,23,0.92))",
							padding: 14,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: 12,
								flexWrap: "wrap",
							}}
						>
							<div style={{ display: "grid", gap: 4 }}>
								<span style={{ fontSize: 14, color: "#c4cbda" }}>
									Attachments
								</span>
								<span style={{ fontSize: 12, color: "#8e98ab" }}>
									Attach images, audio, video, or documents. The playground
									sends them as unified attachments.
								</span>
							</div>

							<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
								<input
									ref={fileInputRef}
									type="file"
									multiple
									onChange={handleFileSelection}
									style={{ display: "none" }}
								/>
								<button
									type="button"
									onClick={() => fileInputRef.current?.click()}
									disabled={isLoading}
									style={{
										borderRadius: 999,
										border: "1px solid #4f6ea8",
										background: "#1f2b42",
										color: "#dfe6f3",
										padding: "10px 14px",
										font: "inherit",
										cursor: isLoading ? "not-allowed" : "pointer",
									}}
								>
									Add files
								</button>
								<button
									type="button"
									onClick={() => setFiles([])}
									disabled={files.length === 0 || isLoading}
									style={{
										borderRadius: 999,
										border: "1px solid #3a4254",
										background: "#121725",
										color: "#a7b0c0",
										padding: "10px 14px",
										font: "inherit",
										cursor:
											files.length === 0 || isLoading
												? "not-allowed"
												: "pointer",
									}}
								>
									Clear all
								</button>
							</div>
						</div>

						{files.length > 0 ? (
							<div
								style={{
									display: "grid",
									gap: 10,
								}}
							>
								{files.map((file, index) => (
									<div
										key={`${file.name}:${file.size}:${file.lastModified}`}
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: 12,
											padding: "12px 14px",
											borderRadius: 12,
											background: "rgba(11,14,21,0.72)",
											border: "1px solid #2d3546",
											flexWrap: "wrap",
										}}
									>
										<div style={{ display: "grid", gap: 2 }}>
											<strong
												style={{
													fontSize: 14,
													color: "#f5f7fb",
													wordBreak: "break-word",
												}}
											>
												{file.name}
											</strong>
											<span style={{ fontSize: 12, color: "#8e98ab" }}>
												{file.type || "application/octet-stream"} •{" "}
												{formatFileSize(file.size)}
											</span>
										</div>

										<button
											type="button"
											onClick={() => removeFile(index)}
											disabled={isLoading}
											style={{
												borderRadius: 999,
												border: "1px solid #5a3440",
												background: "#26141a",
												color: "#ffb4c0",
												padding: "8px 12px",
												font: "inherit",
												cursor: isLoading ? "not-allowed" : "pointer",
											}}
										>
											Remove
										</button>
									</div>
								))}
							</div>
						) : (
							<div
								style={{
									borderRadius: 12,
									border: "1px dashed #3a4254",
									padding: 16,
									color: "#8e98ab",
									fontSize: 13,
								}}
							>
								No attachments selected.
							</div>
						)}
					</div>

					<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => void runRequest(true)}
							disabled={!canSubmit}
							style={{
								borderRadius: 10,
								border: "1px solid #3d7cff",
								background: canSubmit ? "#3d7cff" : "#243250",
								color: "#ffffff",
								padding: "10px 16px",
								font: "inherit",
								cursor: canSubmit ? "pointer" : "not-allowed",
							}}
						>
							{runMode === "stream" ? "Streaming..." : "Run stream=true"}
						</button>

						<button
							type="button"
							onClick={() => void runRequest(false)}
							disabled={!canSubmit}
							style={{
								borderRadius: 10,
								border: "1px solid #30384a",
								background: "#1b2130",
								color: "#f5f7fb",
								padding: "10px 16px",
								font: "inherit",
								cursor: canSubmit ? "pointer" : "not-allowed",
							}}
						>
							{runMode === "batch" ? "Loading..." : "Run stream=false"}
						</button>
					</div>

					{envError ? (
						<div
							style={{
								borderRadius: 12,
								border: "1px solid #62411f",
								background: "#2c2115",
								color: "#f4c98e",
								padding: 12,
							}}
						>
							{envError}
						</div>
					) : null}

					{error ? (
						<div
							style={{
								borderRadius: 12,
								border: "1px solid #6d2f38",
								background: "#31171c",
								color: "#ffb4c0",
								padding: 12,
							}}
						>
							{error}
						</div>
					) : null}
				</section>

				<section
					style={{
						border: "1px solid #252a35",
						borderRadius: 16,
						padding: 20,
						background: "#151923",
						display: "grid",
						gap: 12,
					}}
				>
					<h2 style={{ margin: 0, fontSize: 18 }}>Output</h2>
					<pre
						style={{
							margin: 0,
							minHeight: 180,
							borderRadius: 12,
							border: "1px solid #30384a",
							background: "#0f1117",
							color: "#dfe6f3",
							padding: 14,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
						}}
					>
						{output ||
							(isLoading ? "Waiting for response..." : "No response yet.")}
					</pre>
				</section>

				<section
					style={{
						border: "1px solid #252a35",
						borderRadius: 16,
						padding: 20,
						background: "#151923",
						display: "grid",
						gap: 12,
					}}
				>
					<h2 style={{ margin: 0, fontSize: 18 }}>Final JSON</h2>
					<pre
						style={{
							margin: 0,
							minHeight: 220,
							borderRadius: 12,
							border: "1px solid #30384a",
							background: "#0f1117",
							color: "#9fd3ff",
							padding: 14,
							overflowX: "auto",
						}}
					>
						{finalJson || "Final response metadata will appear here."}
					</pre>
				</section>
			</div>
		</main>
	);
}

export default App;
