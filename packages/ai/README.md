# @hax/ai

`@hax/ai` is the shared package for talking to the Hax AI backend from apps in this repo.

This README covers the main integration flow:

1. Import the package.
2. Create a client instance.
3. Send a request with `generate`.
4. Handle either a batch response or streaming events.
5. Point the client at a backend that accepts the package request shape.

## Install

```bash
bun add @hax/ai effect zod
```

## What This Package Expects

The client created by `create()` sends requests to:

```text
<baseUrl>/api/v1/chat/completions
```

The package currently compiles the app request into the OpenAI Codex provider request internally, so the request shape you send from your app should match the exported `appRequestShape`.

## Create A Client

```ts
import { create } from "@hax/ai";

const ai = create({
	accessToken: process.env.MACHINE_ACCESS_TOKEN ?? "",
	refreshToken: process.env.MACHINE_REFRESH_TOKEN ?? "",
	clientId: process.env.MACHINE_CLIENT_ID ?? "",
	clientSecret: process.env.MACHINE_CLIENT_SECRET ?? "",
	baseUrl: process.env.MACHINE_BASE_URL ?? "http://localhost:3000",
});
```

`create()` does two things for you:

- It resolves the backend endpoint from `baseUrl`.
- It retries once with a refreshed access token if the first request returns an auth expiry error.

## Send A Request

This is the normal shape used by apps. The package accepts provider-specific requests through `generate()`, and today that means `provider: "openai-codex"` with one of the supported Codex models.

```ts
import { create } from "@hax/ai";
import type { UnifiedResponseType } from "@hax/ai";
import * as z from "zod";

const ai = create({
	accessToken: process.env.MACHINE_ACCESS_TOKEN ?? "",
	refreshToken: process.env.MACHINE_REFRESH_TOKEN ?? "",
	clientId: process.env.MACHINE_CLIENT_ID ?? "",
	clientSecret: process.env.MACHINE_CLIENT_SECRET ?? "",
	baseUrl: process.env.MACHINE_BASE_URL ?? "http://localhost:3000",
});

const sum = {
	name: "sum",
	description: "Add two numbers.",
	requiresApproval: false,
	retrySafe: true,
	inputSchema: z.object({
		a: z.number(),
		b: z.number(),
	}),
	execute: async ({ a, b }: { a: number; b: number }) => a + b,
};

async function run(): Promise<UnifiedResponseType> {
	const result = await ai.generate({
		provider: "openai-codex",
		model: "gpt-5.4",
		system: "You are a really helpful AI assistant.",
		stream: true,
		temperature: 0.7,
		maxRetries: 2,
		tools: [sum],
		messages: [
			{
				role: "user",
				content: "What is 2 + 4?",
				timestamp: Date.now(),
			},
		],
	});

	if (!result.stream) {
		return result.response;
	}

	for await (const event of result.events) {
		if (event.type === "text_delta") {
			process.stdout.write(event.delta);
		}
	}

	return await result.final();
}
```

## Streaming Events

When `stream: true`, `generate()` returns:

- `events`: an async iterator of unified stream events
- `textStream`: a text-only readable stream
- `final()`: a promise for the final unified response

The main events most apps care about are:

- `start`
- `text_start`
- `text_delta`
- `text_end`
- `thinking_start`
- `thinking_delta`
- `thinking_end`
- `toolcall_start`
- `toolcall_delta`
- `toolcall_end`
- `approval_required`
- `done`
- `error`

Example event handling:

```ts
const result = await ai.generate({
	provider: "openai-codex",
	model: "gpt-5.4",
	system: "You are a really helpful AI assistant.",
	stream: true,
	temperature: 0.7,
	maxRetries: 2,
	messages: [
		{
			role: "user",
			content: "Write a short hello.",
			timestamp: Date.now(),
		},
	],
});

if (result.stream) {
	for await (const event of result.events) {
		switch (event.type) {
			case "text_delta":
				console.log(event.delta);
				break;
			case "toolcall_start":
				console.log("tool started");
				break;
			case "approval_required":
				console.log(event.approval);
				break;
			case "done":
				console.log(event.message);
				break;
			case "error":
				console.error(event.error);
				break;
		}
	}
}
```

The event flow above matches the way the playground client consumes the package in [playground-client.ts](/Users/harshithpasupuleti/code/hax/apps/playground/src/lib/playground-client.ts).

## Backend Shape

The frontend app only needs to know one backend contract:

- `POST /api/v1/chat/completions`
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

The request body should match the package request shape:

```ts
{
	provider: "openai-codex";
	model: "gpt-5.4";
	system: string;
	stream: boolean;
	temperature: number;
	maxRetries: number;
	messages: Array<...>;
	tools?: Array<...>;
}
```

The backend can respond in either of these ways:

- Non-streaming JSON response with the final `UnifiedResponse`
- Streaming SSE response that emits unified events and ends with a final event

For streaming, the package expects SSE frames such as:

```text
event: start
data: {...}

event: text_delta
data: {...}

event: toolcall_start
data: {...}

event: done
data: {...}
```

That keeps the app code simple because it can consume the same event model no matter which provider is behind the backend.

## Exports You Will Usually Use

Most app integrations only need:

- `create`
- `generate`
- `ToolDefinition`
- `UnifiedResponse`
- `UnifiedStreamEvent`
- `appRequestShape`

## Local Checks

```bash
bun --cwd packages/ai run lint
bun --cwd packages/ai run typecheck
bun --cwd packages/ai run build
```

## Publish

```bash
bun --cwd packages/ai publish --dry-run
bun --cwd packages/ai publish
```

The package is configured to publish to npm as a public scoped package.
