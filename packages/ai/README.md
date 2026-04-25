# @polarish/ai

Polarish is an open-source SDK for building AI workflows where users bring their own AI subscriptions.

It has two packages that work in tandem:

- `@polarish/ai` — a TypeScript SDK to build AI workflows in your app.
- `@polarish/cli` — a local CLI bridge that helps users connect their AI subscriptions and run those workflows through local provider runtimes.

To deliver the full end-user experience, you typically use both packages together.

This package gives you:

- one request shape across providers
- single-turn calls (`generate`)
- full agent loops with tools (`run`)
- streaming events for UI + SSE
- helpers for history and tool messages

Supported provider 

- `openai-codex`
- `anthropic-claude-code`

Model choice recommendation:

- add model picker in UI 
- send selected `provider` + `model` from frontend to backend
- avoid hardcoding one premium model for all users
- hardcoded premium model (example: Claude Opus) can fail for users without required subscription

If you are new, read in order.

---

## Table of contents

1. [Install](#install)
2. [Quick start](#quick-start)
3. `[generate()` single turn](#generate-single-turn)
4. `[run()` full agent loop](#run-full-agent-loop)
5. [Define tools](#define-tools)
6. [Streaming events](#streaming-events)
7. [Message history](#message-history)
8. [Attachments](#attachments)
9. [MCP servers (`mcpServers`)](#mcp-servers-mcpservers)
10. [Approvals (`requiresApproval`)](#approvals-requiresapproval)
11. [Manual loop with `generate()](#manual-loop-with-generate)`
12. [Errors](#errors)
13. [Production checklist](#production-checklist)
14. [Useful exports](#useful-exports)

---

## Install

```bash
bun add @polarish/ai
```
```bash
bun add -g @polarish/cli
```

---

## Quick start

```ts
import { create } from "@polarish/ai";

const client = create({
  baseUrl: "http://127.0.0.1:4318", // optional, this is default
});
```

---

## `generate()` single turn

Use this for one request/one response.

```ts
const result = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "You are helpful....",
  messages: [{ role: "user", content: "Hello" }],
  stream: false,
  temperature: 0.2,
  maxRetries: 1,
});

if (!result.stream) {
  console.log(result.response.text);
}
```

Streaming single turn:

```ts
const stream = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "You are helpful.",
  messages: [{ role: "user", content: "Write one short line" }],
  stream: true,
  temperature: 0.2,
  maxRetries: 1,
});

for await (const event of stream.events) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

const final = await stream.final(); // UnifiedResponse
console.log(final.finishReason);
```

---

## `run()` full agent loop

Use this for complex workflows where model calls tools.

### Batch run

```ts
const result = await client.run(
  {
    provider: "openai-codex",
    model: "gpt-5.4",
    system: "Use tools when needed.",
    messages: [{ role: "user", content: "Solve 7 + 9 using tool" }],
    tools: [sumTool],
    stream: false,
    temperature: 0.2,
    maxRetries: 1,
  },
  {
    maxIterations: 5,
  },
);

console.log(result.response.text); // final assistant answer
console.log(result.messages); // full history for next call
console.log(result.iterations); // number of generate turns
```

### Streaming run

```ts
const runner = await client.run(
  {
    provider: "openai-codex",
    model: "gpt-5.4",
    system: "Use tools when needed.",
    messages: [{ role: "user", content: "List files and summarize" }],
    tools: [lsTool],
    stream: true,
    temperature: 0.2,
    maxRetries: 1,
  },
  { maxIterations: 10 },
);

for await (const event of runner.events) {
  switch (event.type) {
    case "run_turn_start":
      console.log("turn start", event.iteration);
      break;
    case "text_delta":
      process.stdout.write(event.delta);
      break;
    case "run_tool_executing":
      console.log("tool running", event.toolName, event.arguments);
      break;
    case "run_tool_executed":
      console.log("tool done", event.toolName, "isError", event.isError);
      break;
    case "run_complete":
      console.log("done turns", event.iterations);
      break;
  }
}
```

Important:

- pick one final-data path: read from `run_complete` OR call `runner.final()`.
- do not duplicate both into your own terminal event.

---

## Define tools

Every tool should include:

- `name`
- `description`
- `inputSchema`
- `execute`

```ts
import { z } from "zod";

const sumInput = z.object({
  a: z.number(),
  b: z.number(),
});

const sumTool = {
  name: "sum",
  description: "Adds two numbers",
  inputSchema: sumInput,
  execute: async (input: unknown) => {
    const { a, b } = sumInput.parse(input);
    return { result: a + b };
  },
  retrySafe: true,
};
```

Supported `inputSchema` styles:

- JSON Schema object
- Zod schema
- Effect schema
- JS/TS shorthand object

If tool exists in `tools` but has no `execute`, loop returns tool error for that call.

---

## Streaming events

### `generate({ stream: true })` emits

- `start`
- `text_start` / `text_delta` / `text_end`
- `thinking_start` / `thinking_delta` / `thinking_end`
- `toolcall_start` / `toolcall_delta` / `toolcall_end`
- `approval_required`
- `done`
- `error`

Read final payload from:

- `done.response`
- or `await result.final()`

Do not persist `partial` as final state.

### `run({ stream: true })` adds lifecycle events

All events above +

- `run_turn_start`
- `run_tool_executing`
- `run_tool_executed`
- `run_turn_end`
- `run_complete`

---

## Message history

Message roles:

- `user`
- `assistant`
- `tool`

Correct order per step:

```text
assistant -> tool result(s) -> next request
```

Continue conversation with:

- `run()` batch result: `result.messages`
- `run()` stream: `run_complete.messages`

Helpers (clear behavior):

- `toAssistantMessage(response)`
  - converts one `UnifiedResponse` -> one assistant `message`
  - conversion only
  - you append/store manually
- `appendAssistant(messages, response)`
  - same conversion
  - also appends to your existing `messages` array
  - returns next `messages`
- `toolExecutionToMessage(input)`
  - converts tool execution result -> one `tool` message

Critical tool id rule:

```ts
toolCallId: call.callId ?? call.id
```

Use `callId` when present.

---

## Attachments

User content can include text + attachments.

Attachment kinds:

- `image`
- `audio`
- `video`
- `document`

Attachment source shapes:

- base64: `{ type: "base64", data: "..." }`
- url: `{ type: "url", url: "https://..." }`
- file id: `{ type: "file_id", fileId: "..." }`

Example:

```ts
{
  role: "user",
  content: [
    { type: "text", text: "Explain this image" },
    {
      type: "attachment",
      kind: "image",
      mimetype: "image/png",
      source: { type: "base64", data: "<bytes>" },
    },
  ],
}
```

Check model input support before sending attachments.

---

## MCP servers (`mcpServers`)

Use this when tool logic already exists in an MCP server process.

### `mcpServers` shape

`mcpServers` is a record:

- key = server alias you choose (example: `weather`, `filesystem`)
- value = MCP stdio launch config

Config fields:

- `command` (required): executable name/path
- `args` (optional): command arguments
- `env` (optional): extra env vars for that process

```ts
mcpServers: {
  weather: {
    command: "npx",
    args: ["-y", "@some-org/mcp-weather-server"],
    env: {
      WEATHER_API_KEY: process.env.WEATHER_API_KEY ?? "",
    },
  },
}
```

### Full request example

```ts
await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "Use tools if useful.",
  messages: [{ role: "user", content: "Weather in Paris" }],
  mcpServers: {
    weather: {
      command: "npx",
      args: ["-y", "@some-org/mcp-weather-server"],
    },
  },
  stream: false,
  temperature: 0.2,
  maxRetries: 1,
});
```

### When to use `mcpServers` vs `tools`

- use `tools` when you define tool code in your app (`execute` function)
- use `mcpServers` when tools live in external MCP server
- you can use both in same request

### With `run()`

- `run()` still handles conversation loop and history
- MCP tool execution happens through bridge + MCP server process

Security:

- this can spawn local processes
- keep bridge on localhost
- allow only trusted callers
- never pass untrusted `command`/`args`

---

## Approvals (`requiresApproval`)

Tool can request human gate.

```ts
const tool = {
  name: "deleteFile",
  description: "Deletes one file",
  inputSchema,
  execute,
  requiresApproval: true,
  rejectionMode: "return_tool_error", // or "abort_run"
};
```

When streaming, watch `approval_required` event.

---

## Manual loop with `generate()`

Use only when you need custom orchestration.

```ts
import {
  appendAssistant,
  toAssistantMessage,
  toolExecutionToMessage,
} from "@polarish/ai";

let messages = [{ role: "user" as const, content: "What is 3 + 4?" }];

const first = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "Use sum tool",
  messages,
  tools: [sumTool],
  stream: false,
  temperature: 0.2,
  maxRetries: 1,
});

if (first.stream) throw new Error("Expected batch");

// Option A: convert + append in one step
messages = appendAssistant(messages, first.response);

// Option B: convert only, then append/store manually
const assistantMessage = toAssistantMessage(first.response);
messages.push(assistantMessage);

for (const call of first.response.toolCalls) {
  const output = await sumTool.execute(call.arguments);
  messages.push(
    toolExecutionToMessage({
      toolCallId: call.callId ?? call.id,
      toolName: call.name,
      result: output,
    }),
  );
}

const second = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "Use sum tool",
  messages,
  tools: [sumTool],
  stream: false,
  temperature: 0.2,
  maxRetries: 1,
});
```

For most cases, prefer `run()`.

---

## Errors

- Batch non-2xx: throws `Error` with status/body
- Stream non-2xx: throws before parsing stream
- Stream processing failure: `events` and `final()` reject
- Missing fetch runtime: throws `Fetch implementation is required`

---

## Production checklist

- if tools involved, use `run()`
- set `maxIterations` explicitly
- every tool has `execute`
- continue with returned `messages`
- in manual loop use `call.callId ?? call.id`
- handle stream `error` and aborted flows
- keep bridge local + locked down
- trust `runner.events` shape, do not reconstruct
- add model picker in UI; do not hardcode single premium model in backend
- fallback to accessible model when selected model unavailable (subscription/entitlement missing)

---

## Useful exports

Main:

- `create`
- `generate`
- `run`

History helpers:

- `appendAssistant`
  - input: `message[] + UnifiedResponse`
  - output: next `message[]`
  - purpose: auto appends new assistant turn to your message history
- `toAssistantMessage`
  - input: `UnifiedResponse`
  - output: one assistant `message`
  - purpose: convert response into one history-ready assistant message you can store/push manually
- `toolExecutionToMessage`
  - input: tool execution result
  - output: one tool `message`

Schemas / types:

- `appRequestShape`
- `UnifiedResponse`
- all stream event types

---

## Recommended model IDs for model picker

Use these IDs directly in your UI picker options.

### Codex Models

- `gpt-5.2`
- `gpt-5.3-codex`
- `gpt-5.3-codex-spark`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.5`

### Anthropic ClaudeCode Model id

- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-haiku-4-5`

---

## License

MIT
