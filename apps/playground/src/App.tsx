import { useState } from "react";
import { runPlaygroundRequest } from "./lib/playground-client";

function App() {
	const [message, setMessage] = useState("hello");
	const [output, setOutput] = useState("");
	const [events, setEvents] = useState<string[]>([]);
	const [traceLogs, setTraceLogs] = useState<string[]>([]);
	const [finalJson, setFinalJson] = useState("");
	const [errorJson, setErrorJson] = useState("");
	const [sessionJson, setSessionJson] = useState("");
	const [isRunning, setIsRunning] = useState(false);

	const run = async () => {
		setIsRunning(true);
		setOutput("");
		setEvents([]);
		setTraceLogs([]);
		setFinalJson("");
		setErrorJson("");
		setSessionJson("");

		try {
			await runPlaygroundRequest(
				{ latestMessage: message },
				{
					onTrace: (message: string) => {
						setTraceLogs((prev) => [...prev, message]);
					},
					onEvent: (event: { type: string }) => {
						setEvents((prev) => [...prev, event.type]);
					},
					onTextDelta: (event: { delta: string }) => {
						setOutput((prev) => prev + event.delta);
					},
					onDone: (event: { message: unknown }) => {
						setFinalJson(JSON.stringify(event.message, null, 2));
					},
					onSessionTokens: (tokens: unknown) => {
						setSessionJson(JSON.stringify(tokens, null, 2));
					},
					onError: (event: { error: unknown }) => {
						setErrorJson(JSON.stringify(event.error, null, 2));
					},
				},
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setTraceLogs((prev) => [
				...prev,
				`[${new Date().toISOString()}]  run.exception: ${message}`,
			]);
			setErrorJson(JSON.stringify({ message }, null, 2));
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<div style={{ padding: 16, display: "grid", gap: 12 }}>
			<h1>Playground</h1>

			<textarea
				value={message}
				onChange={(e) => setMessage(e.target.value)}
				rows={4}
			/>

			<button
				type="button"
				onClick={run}
				disabled={isRunning || message.trim().length === 0}
			>
				{isRunning ? "Running..." : "Run"}
			</button>

			<section>
				<h2>Output</h2>
				<pre>{output}</pre>
			</section>

			<section>
				<h2>Events</h2>
				<pre>{events.join("\n")}</pre>
			</section>

			<section>
				<h2>Trace Logs</h2>
				<pre>{traceLogs.join("\n")}</pre>
			</section>

			<section>
				<h2>Final</h2>
				<pre>{finalJson}</pre>
			</section>

			<section>
				<h2>Session Tokens</h2>
				<pre>{sessionJson}</pre>
			</section>

			<section>
				<h2>Error</h2>
				<pre>{errorJson}</pre>
			</section>
		</div>
	);
}

export default App;
