# @polarish/ai

Polarish is open-source SDK for AI workflows where users bring their own AI subscriptions.

Two packages work together:

- `@polarish/ai` — TypeScript SDK used inside your app.
- `@polarish/cli` — local bridge that connects user AI subscriptions and runs provider runtimes.

Supported providers:

- `openai-codex`
- `anthropic-claude-code`

---

## Install

```bash
bun add @polarish/ai
bun add -g @polarish/cli
```

---

## Quick Start

Start with one client. Use this client everywhere.

```ts
import { create } from "@polarish/ai";

const client = create({
  baseUrl: "http://127.0.0.1:4318",
  origin: ["https://app.example.com", "http://localhost:3000"],
});
```

`baseUrl` means local bridge URL. This is where `@polarish/ai` sends requests. `@polarish/cli` starts this bridge. Default bridge URL is `http://127.0.0.1:4318`.

`origin` means app identity sent to bridge. Bridge uses it for allowlist checks. Pass one URL string, several URLs separated by commas and/or spaces in one string, or a `string[]`. During development, add the local server URL where your app runs, for example `http://localhost:3000`, so the bridge can allow requests from your dev app.

After setup:

- `client.generate(request)` sends one model request.
- `client.run(request)` runs agent loop with tools.

---

## Generate

Use `client.generate()` for one request and one response.

```ts
const result = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "You are helpful.",
  messages: [{ role: "user", content: "Hello" }],
  stream: false,
  temperature: 0.2,
  maxRetries: 1,
});

if (!result.stream) {
  console.log(result.response.text);
}
```

Streaming:

```ts
const result = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "You are helpful.",
  messages: [{ role: "user", content: "Write one short line" }],
  stream: true,
  temperature: 0.2,
  maxRetries: 1,
});

for await (const event of result.events) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

const final = await result.final();
console.log(final.finishReason);
```

---

## Run

Use `client.run()` when model can call tools. `run()` handles loop:

```text
generate -> execute tools -> append tool results -> generate again
```

`client.run(request, options)` takes:

- `maxIterations` to cap loop length. Default: `10`.
- `onTurn` to observe each finished turn.

Batch run:

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

console.log(result.response.text);
console.log(result.messages);
console.log(result.iterations);
```

Streaming run:

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
  {
    maxIterations: 10,
  },
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
      console.log("tool done", event.toolName, event.isError);
      break;
    case "run_complete":
      console.log("done turns", event.iterations);
      break;
  }
}
```

Pick one final path: use `run_complete` event or `await runner.final()`.

---

## Tools

Tool shape:

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

Supported `inputSchema`:

- JSON Schema object
- Zod schema
- Effect schema
- JS/TS shorthand object

If tool has no `execute`, run loop returns tool error for that call.

---

## Streaming Events

`client.generate({ stream: true })` emits:

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

Final payload:

- `done.response`
- or `await result.final()`

Do not persist `partial` as final state.

`client.run({ stream: true })` also emits:

- `run_turn_start`
- `run_tool_executing`
- `run_tool_executed`
- `run_turn_end`
- `run_complete`

---

## Message History

Message roles:

- `user`
- `assistant`
- `tool`

Correct order:

```text
assistant -> tool result(s) -> next request
```

Continue conversation with returned history:

- batch run: `result.messages`
- streaming run: `run_complete.messages`

History helpers:

- `appendAssistant(messages, response)` converts response to assistant message and appends it.
- `toAssistantMessage(response)` converts response to one assistant message.
- `toolExecutionToMessage(input)` converts tool result to one tool message.

Tool id rule:

```ts
toolCallId: call.callId ?? call.id
```

Use `callId` when present.

---

## Attachments

User message content can mix text and attachments.

Kinds:

- `image`
- `audio`
- `video`
- `document`

Sources:

- base64: `{ type: "base64", data: "..." }`
- URL: `{ type: "url", url: "https://..." }`
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

## MCP Servers

Use `mcpServers` when tools live in external MCP server process.

Shape:

- key = server alias, for example `weather`
- value = stdio launch config

Config:

- `command` required
- `args` optional
- `env` optional

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
      env: {
        WEATHER_API_KEY: process.env.WEATHER_API_KEY ?? "",
      },
    },
  },
  stream: false,
  temperature: 0.2,
  maxRetries: 1,
});
```

Use:

- `tools` when tool code lives in your app.
- `mcpServers` when tool code lives in external MCP process.
- both can be used in same request.

Security:

- MCP can spawn local processes.
- Keep bridge on localhost.
- Allow only trusted callers.
- Never pass untrusted `command` or `args`.

---

## Approvals

Tool can require human approval.

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

When streaming, watch `approval_required`.

---

## Errors

- Batch non-2xx throws `Error` with status/body.
- Stream non-2xx throws before parsing stream.
- Stream processing failure rejects `events` and `final()`.
- Missing fetch runtime throws `Fetch implementation is required`.

---

## Checklist

- use one `client` from `create({ baseUrl, origin })`
- during development, include your local app server URL in `origin` so the bridge allows requests from your dev app
- use `client.run()` when tools involved
- set `maxIterations`
- give every local tool an `execute`
- continue with returned `messages`
- use `call.callId ?? call.id` for tool results
- handle stream `error`
- handle aborts and reconnects
- keep bridge local and locked down
- add model picker in UI
- avoid hardcoding one premium model for all users

---

## Useful Exports

Client:

- `create`

History:

- `appendAssistant`
- `toAssistantMessage`
- `toolExecutionToMessage`

Schemas and types:

- `appRequestShape`
- `UnifiedResponse`
- stream event types
- provider model schemas

---

## Model IDs

Use these IDs in app model picker.

Codex:

- `gpt-5.2`
- `gpt-5.3-codex`
- `gpt-5.3-codex-spark`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.5`

Anthropic Claude Code:

- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-haiku-4-5`

---

## License

MIT
