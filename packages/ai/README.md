# @polarish/ai

## Polarish is typeScript SDK which provides a unified layers designed to help you build AI-powered applications and agentic workflows which work in the tandam with the polarish-cli

## Table of contents

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [generate() — single request](#generate--single-request)
4. [run() — agent loop](#run--agent-loop)
5. [Request shape (`appRequestShape`)](#request-shape-apprequestshape)
6. [Messages, attachments, and tool IDs](#messages-attachments-and-tool-ids)
7. [Defining tools](#defining-tools)
8. [Manual tool loops with generate()](#manual-tool-loops-with-generate)
9. [Backend & testing exports](#backend--testing-exports)
10. [Errors & runtime](#errors--runtime)
11. [appendAssistantFromUnifiedResponse](#appendassistantfromunifiedresponse)
12. [UnifiedResponse](#unifiedresponse)
13. [generate() streaming events](#generate-streaming-events)
14. [run() streaming events](#run-streaming-events)

---

## Installation

```bash
bun add @polarish/ai
```

---

## Quick start

`create(options)` returns a `Client` with two methods:

| Method | What it does |
| --- | --- |
| `generate(request)` | Single HTTP request → one `UnifiedResponse`. You own the loop. |
| `run(request, options?)` | Full agent loop — tool execution, history, and re-calling `generate()` handled automatically. |

```ts
import { create } from "@polarish/ai";

const client = create({
  baseUrl: "http://127.0.0.1:4318", // default — local bridge
});
```

---

## generate() — single request

`generate()` sends one `POST` to `{baseUrl}/v1/generate` and returns either a batch result or a streaming handle. It does nothing else — no tool execution, no loop. Use it when the model won't call tools, or when you need full control over the loop yourself.

**Batch (`stream: false`):**

```ts
const result = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello." }],
  stream: false,
  temperature: 0.8,
  maxRetries: 2,
});

console.log(result.response.text);
```

**Streaming (`stream: true`):**

```ts
const result = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello." }],
  stream: true,
  temperature: 0.8,
  maxRetries: 2,
});

for await (const event of result.events) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

const final = await result.final(); // full UnifiedResponse
```

See [generate() streaming events](#generate-streaming-events) for all event types.

---

## run() — agent loop

`run()` drives the full multi-turn tool execution cycle automatically:

```
generate() → tool calls? → execute tools locally → append results → generate() again → repeat
```

It stops when the model finishes without requesting tools, `maxIterations` is reached, or the abort signal fires.

**Every tool that the model may call must have an `execute()` function on its `ToolDefinition`.** Tools without `execute()` return an error result to the model so the loop can continue rather than crash.

### Batch agent loop (`stream: false`)

Waits for the full loop to finish before resolving. Use when you don't need live UI updates:

```ts
const result = await client.run({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "Use tools when needed.",
  messages: [{ role: "user", content: "What is 3 + 4?" }],
  tools: [sumTool],
  stream: false,
  temperature: 0.7,
  maxRetries: 2,
}, {
  maxIterations: 5,
  onTurn: ({ iteration, toolResults }) => {
    console.log(`Turn ${iteration}: ${toolResults.length} tool(s) ran`);
  },
});

console.log(result.response.text); // final answer
console.log(result.messages);      // full history — pass to next run() to continue
console.log(result.iterations);    // how many generate() calls were made
```

### Streaming agent loop (`stream: true`)

Returns a streaming handle immediately. Every turn streams as it happens — text appears word by word, tool calls show before they execute, tool results appear as they complete:

```ts
const runner = await client.run({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "Use tools when needed.",
  messages: [{ role: "user", content: "List files, grep for config, then summarize." }],
  tools: [lsTool, grepTool],
  stream: true,
  temperature: 0.7,
  maxRetries: 2,
}, {
  maxIterations: 10,
});

for await (const event of runner.events) {
  switch (event.type) {
    case "text_delta":
      appendToMessageBubble(event.delta);       // stream text into chat
      break;
    case "run_tool_executing":
      showToolCard(event.toolName, event.arguments); // "Running ls…"
      break;
    case "run_tool_executed":
      updateToolCard(event.toolName, event.result, event.isError);
      break;
    case "run_turn_start":
      showThinkingIndicator();
      break;
    case "run_complete":
      console.log(`Done in ${event.iterations} turn(s)`);
      break;
  }
}

const result = await runner.final(); // RunResult: { response, messages, iterations }
```

See [run() streaming events](#run-streaming-events) for the full event reference.

### run() options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `maxIterations` | `number` | `10` | Hard cap on `generate()` calls. Prevents infinite tool loops. |
| `onTurn` | `(turn: RunTurnEvent) => void` | — | Called after each completed turn. For streaming runs, prefer `run_turn_end` on `events`. |
| `headers` | `Record<string, string>` | — | Extra HTTP headers forwarded to every `generate()` call. |

### run() result

| Field | Type | Notes |
| --- | --- | --- |
| `response` | `UnifiedResponse` | The final assistant turn — the one where the model stopped requesting tools. |
| `messages` | `message[]` | Full conversation history. Starts from `request.messages` and grows each turn. Pass back into the next `run()` to continue. |
| `iterations` | `number` | Total `generate()` HTTP calls made. |

### generate() vs run() — when to use which

| Situation | Use |
| --- | --- |
| Simple Q&A, no tools | `generate()` |
| Single-turn tool call, want full control | `generate()` + manual loop |
| Multi-turn agent that calls tools | `run()` |
| Need live UI updates (text streaming, tool cards) | `run({ stream: true })` |
| Background job, no UI | `run({ stream: false })` |

---

## Request shape (`appRequestShape`)

Codex-backed unified API:


| Field         | Type               | Notes                                                                                                            |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `provider`    | `"openai-codex"`   | codex is the only provider supported right now we are working to intergate others like claude , gemini , copilot |
| `model`       | `CodexModelId`     | e.g. `gpt-5.4` — import `CodexModelId` from `@polarish/ai/openai-codex`                                          |
| `system`      | `string`           | System / developer instructions                                                                                  |
| `messages`    | `message[]`        | User, assistant, tool turns — [Messages](#messages-attachments-and-tool-ids)                                     |
| `tools`       | `ToolDefinition[]` | Optional — [Defining tools](#defining-tools)                                                                     |
| `stream`      | `boolean`          | `false` → JSON body; `true` → SSE unified stream                                                                 |
| `temperature` | `number`           | Sampling                                                                                                         |
| `maxRetries`  | `number`           | SDK / transport retry hint                                                                                       |
| `signal`      | `AbortSignal?`     | Abort HTTP                                                                                                       |


---

## Messages, attachments, and tool IDs

The `messages` array is the conversation history you send on every request. Each item is one of three roles: `user`, `assistant`, or `tool`. The SDK calls this union `message`.

---

### User messages

The simplest user message is a plain string:

```ts
{
 role: "user"
 content: "What is the capital of India?" 
}
```

But `content` can also be an **array of content blocks** — this is how you send text alongside files, images, or other attachments in the same message:

```ts
{
  role: "user",
  content: [
    { 
      type: "text",
      text: "What is in this image?"
    },
    {
      type: "attachment",
      kind: "image",
      mimetype: "image/png",
      filename: "screenshot.png",   // optional
      source: { type: "base64", data: "<base64-encoded-bytes>" },
    },
  ],
}
```

The `timestamp` field is optional on all roles. Set it when you need stable ordering in stored history.

---

### Attachments explained

An `AttachmentContent` block has four fields:


| Field      | Type                                       | Notes                                        |
| ---------- | ------------------------------------------ | -------------------------------------------- |
| `type`     | `"attachment"`                             | Always `"attachment"` — identifies the block |
| `kind`     | `"image" | "audio" | "video" | "document"` | What kind of file this is                    |
| `mimetype` | `string`                                   | e.g. `"image/png"`, `"application/pdf"`      |
| `filename` | `string` *(optional)*                      | Hint to the model; not required              |
| `source`   | One of three shapes (see below)            | Where the bytes come from                    |


#### Three ways to supply the file

**1. Base64 — inline bytes**

Use when you already have the file in memory (e.g. user uploads a file in the browser):

```ts
source: {
  type: "base64",
  data: "<base64-encoded-string>",
}
```

**2. URL — remote file**

Use when the file is publicly accessible (or behind a signed URL):

```ts
source: {
  type: "url",
  url: "https://example.com/report.pdf",
}
```

**3. File ID — already uploaded to the provider**

Use when you uploaded the file in a previous call and received a provider file id back:

```ts
source: {
  type: "file_id",
  fileId: "file-abc123",
}
```

#### Full examples

Image from base64:

```ts
{
  type: "attachment",
  kind: "image",
  mimetype: "image/jpeg",
  filename: "photo.jpg",
  source: { type: "base64", data: "/9j/4AAQSkZJRgAB..." },
}
```

PDF document from URL:

```ts
{
  type: "attachment",
  kind: "document",
  mimetype: "application/pdf",
  filename: "contract.pdf",
  source: { type: "url", url: "https://cdn.example.com/contract.pdf" },
}
```

#### Which models accept attachments?

Not every model supports attachments. Each model in the `openaiCodex` catalog declares its accepted input types:

```ts
import { openaiCodex } from "@polarish/ai";

// "gpt-5.4" → input: ["text", "attachment"]  ✓ multimodal
// "gpt-5.3-codex-spark" → input: ["text"]     ✗ text only
console.log(openaiCodex["gpt-5.4"].input);
```

If you send an attachment to a text-only model, the bridge will reject or drop it. Check `model.input` before adding attachment blocks. See [Backend & testing exports](#backend--testing-exports) for the full catalog.

---

### Assistant messages

Assistant turns in history may contain text, optional reasoning (`thinking`), and tool calls. You normally build these with `appendAssistantFromUnifiedResponse` instead of writing them by hand:

```ts
// Text only
{
  role: "assistant",
  content: [
    { type: "text", 
      text: "I'll help with that." 
    },
  ],
  usage: { ... },
  provider: "openai-codex",
  stopReason: "stop",
}
```



When the model also thinks and calls a tool:

```ts
{
  role: "assistant",
  content: [
    { type: "thinking",
      thinking: "The user wants me to search for something..."
    },

    { type: "text", 
      text: "Let me look that up."
    },

    {
      type: "toolcall",
      id: "fc_abc123",       // provider output item id
      callId: "call_xyz789", // correlation id — use this in toolExecutionToMessage
      name: "searchDocs",
      arguments: { q: "tool ids" },
    },
  ],
  usage: { ... },
  provider: "openai-codex",
  stopReason: "toolUse",
}
```

---

### Tool result messages

After you run a tool locally, you append one `role: "tool"` message per tool call before the next `generate`:

```ts
{
  role: "tool",
  toolCallId: "call_xyz789",  // must match callId (or id) from the assistant toolcall block
  toolName: "searchDocs",
  content: [{ type: "text", text: "Found 3 relevant docs." }],
  isError: false,
}
```

Use `toolExecutionToMessage` to build this — it handles stringifying non-string results automatically:

```ts
import { toolExecutionToMessage } from "@polarish/ai";

messages.push(
  toolExecutionToMessage({
    toolCallId: call.callId ?? call.id,
    toolName: call.name,
    result: { docs: ["doc1", "doc2", "doc3"] }, // objects get JSON.stringify'd
    isError: false,
  }),
);
```

Tool result `content` can also include attachments — for example, if your tool returns an image:

```ts
{
  role: "tool",
  toolCallId: "call_xyz789",
  toolName: "generateChart",
  content: [
    { type: "text", text: "Here is the chart." },
    {
      type: "attachment",
      kind: "image",
      mimetype: "image/png",
      source: { type: "base64", data: "<chart-png-bytes>" },
    },
  ],
  isError: false,
}
```

**Append order matters.** For each agent step:

```
assistant turn  →  tool result(s)  →  next generate()
```

---

### Tool call IDs

When the model calls a tool, it produces two IDs:


| ID       | Example       | What it is                                                      |
| -------- | ------------- | --------------------------------------------------------------- |
| `id`     | `fc_abc123`   | The output item ID assigned by the provider to this tool call   |
| `callId` | `call_xyz789` | The correlation ID the provider expects back on the tool result |


Always use `call.callId ?? call.id` when building tool result messages — `callId` is what the provider uses to match results back to the correct tool call:

```ts
toolExecutionToMessage({
  toolCallId: call.callId ?? call.id,  // ← correct
  toolName: call.name,
  result: output,
})
```

If you use `call.id` when `callId` is present, the provider may not match the result and the agent loop will break.

---

## Defining tools

Put `ToolDefinition` values on `tools`. For agent loops you typically provide `name`**,** `description`, `inputSchema`, and `execute`. The hosted model does not run `execute`—your loop does after `tool-call` parts in `UnifiedResponse` (and after any approval flow).


| Field              | Purpose                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputSchema`      | Model args → compiled strict JSON Schema for the provider.                                                                                                            |
| `outputSchema`     | Optional — documents / validates `execute` output (Zod / JSON Schema / Effect / shorthand, same families as input).                                                   |
| `execute`          | Parse input, run work, return sync/async. Pair with `toolExecutionToMessage` for the next `messages` array.                                                           |
| `requiresApproval` | `true` → stream may emit `approval_required` before the tool completes — [Example](#example-requiresapproval-false) and [approval flow](#handling-approval_required). |
| `rejectionMode`    | If the user rejects: `return_tool_error` (error to model) vs `abort_run`. Only meaningful with `requiresApproval`.                                                    |
| `retrySafe`        | Idempotent-read hint.                                                                                                                                                 |
| `metadata`         | Routing, analytics, flags.                                                                                                                                            |


### `inputSchema` shapes

The Codex compiler emits a **strict root object JSON Schema**. Only these shapes are supported (otherwise compilation throws):


| Shape                  | What                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Zod**                | `z.object({ … })` — JSON Schema via `toJSONSchema` or `zod-to-json-schema`.                                                        |
| **Effect Schema**      | `effect/Schema` → `JSONSchema.make(…, { target: "jsonSchema7" })`.                                                                 |
| **JSON Schema object** | Draft keywords; values JSON-serializable.                                                                                          |
| **JS/TS shorthand**    | Plain object (not JSON Schema): `String` / `Number` / `Boolean` leaves — normalized in the compiler. Quick prototypes without Zod. |


You can mix styles across tools in one request. **Zod** is a solid default (types, `.describe()`, local parse).

The `ToolDefinition` schema in `types.ts` marks `execute` optional for flexibility; **agent loops that run tools should always supply `execute`** (or an equivalent path) on the client.

### Example: `requiresApproval: false`

Model calls tool → run `execute` → append assistant + tool → `generate` again. `stream: true` or `false` — no `approval_required` for this tool.

```ts
import { z } from "zod";
import {
  appendAssistantFromUnifiedResponse,
  toolExecutionToMessage,
} from "@polarish/ai";

const sumInput = z.object({
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});

const sumOutput = z.object({
  result: z.number().describe("a + b"),
});

const sumTool = {
  name: "sum",
  description: "Adds two numbers and returns { result }.",
  inputSchema: sumInput,
  outputSchema: sumOutput,
  execute: async (input: unknown) => {
    const { a, b } = sumInput.parse(input);
    return sumOutput.parse({ result: a + b });
  },
  requiresApproval: false,
  retrySafe: true,
  metadata: { kind: "math" },
};

let messages = [{ role: "user" as const, content: "What is 3 plus 4?" }];

const first = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "Use the sum tool when the user asks to add numbers.",
  messages,
  tools: [sumTool],
  stream: false,
  temperature: 0.7,
  maxRetries: 2,
});

if (first.stream) throw new Error("Expected batch response");

messages = appendAssistantFromUnifiedResponse(messages, first.response);

for (const call of first.response.toolCalls) {
  if (call.name !== sumTool.name) continue;
  const out = await sumTool.execute(sumInput.parse(call.arguments));
  messages.push(
    toolExecutionToMessage({
      toolCallId: call.callId ?? call.id,
      toolName: call.name,
      result: out,
    }),
  );
}

await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "Use the sum tool when the user asks to add numbers.",
  messages,
  tools: [sumTool],
  stream: false,
  temperature: 0.7,
  maxRetries: 2,
});
```

### Example: `requiresApproval: true`

Same shape + `requiresApproval: true` + `rejectionMode`. Prefer `stream: true` — watch `approval_required` on `events`.

```ts
const sumToolWithApproval = {
  ...sumTool,
  requiresApproval: true,
  rejectionMode: "return_tool_error" as const,
};
```

#### Handling approval_required

1. Call streaming `generate` with `tools` that set `requiresApproval: true` where needed.
2. `for await (const event of result.events)`. When `event.type === "approval_required"`, read `event.approval`: `id`, `runId`, `toolCallId`, `toolName`, `input`, `status: "pending"`, `rejectionMode`.
3. In the UI, confirm or deny the action; record the choice.
4. Approve or reject through **your** app/backend (there is no separate SDK `approve()` — the contract lives in your own tool loop around `POST /v1/generate`).
5. After approval → server continues → consume SSE until `done` or the next `approval_required`. When tool calls are finalized locally, run `execute`, then `toolExecutionToMessage`, update history, and call `generate` again if another turn is needed.
6. On rejection: `return_tool_error` sends an error to the model; `abort_run` stops the run — follow your `done` / `error` handling.

More: [Tools and agent loops](#tools-and-agent-loops), [Streaming events reference](#streaming-events-reference).

---

## Manual tool loops with generate()

If you need full control over each turn — custom retry logic, approval gates, or side effects between turns — manage the loop yourself using `generate()` directly.

> **Prefer `client.run()`** for standard agent loops — it handles everything below automatically.

The steps for one turn:

```
generate() → check toolCalls → execute each → appendAssistantFromUnifiedResponse → toolExecutionToMessage → generate() again
```

```ts
import {
  appendAssistantFromUnifiedResponse,
  toolExecutionToMessage,
} from "@polarish/ai";

let messages = [{ role: "user" as const, content: "What is 3 + 4?" }];

// Step 1: call generate
const first = await client.generate({
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "Use the sum tool.",
  messages,
  tools: [sumTool],
  stream: false,
  temperature: 0.7,
  maxRetries: 2,
});

// Step 2: append the assistant turn to history
messages = appendAssistantFromUnifiedResponse(messages, first.response);

// Step 3: execute each tool and append results
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

// Step 4: call generate again with the full history
// messages is now: [userMsg, assistantMsg, toolResultMsg]
const second = await client.generate({ ..., messages });
```

**History helpers:**

| Export | Does |
| --- | --- |
| `appendAssistantFromUnifiedResponse` | Append completed assistant turn to `messages` |
| `unifiedResponseToAssistantMessage` | Convert `UnifiedResponse` → assistant `message` (no append) |
| `toolExecutionToMessage` | Build `role: "tool"` message after `execute()` |
| `normalizeToolArgumentsForHistory` | Normalize tool args to `Record<string, unknown>` |
| `finishReasonToStopReason` | Map `ResponseFinishReason` → `stopReason` |
| `emptyUsage` | Zero `Usage` when the run omitted token counts |

---

## Backend & testing exports

Useful when **adapting** Codex streaming in tests or tools, or building **model pickers** in the UI. The runnable bridge HTTP server lives in the `**@polarish/cli`** package source (`src/bridge/`); these exports help you mirror the same request/response mapping in code or tests.


| Export                                                                                 | Role                                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `compileRequest`                                                                       | Turn unified `appRequestShape` into Codex wire input (same tool / message rules as the client).                          |
| `appRequestShape`, `codexRequestShape`                                                 | Schema types for unified vs native Codex bodies.                                                                         |
| `openaiCodex`, `CodexModelsSchema`, `CodexModelId`                                     | `@polarish/ai/openai-codex` — allowed `model` ids, costs, context window, and per-model `input` (`text` / `attachment`). |
| `codexUnifiedStreamEvents`, `unifiedStreamDoneReason`, `approvalToolConfigFromRequest` | Map Codex response streams into unified SSE-style events and approval metadata.                                          |
| `emptyAccumulator`, `mapChunk`, `parseToolCallItem`, `toUnifiedSnapshot`               | Incremental unified snapshots from provider chunks.                                                                      |
| `createUnifiedResponseStream`, `unifiedResponseForStreamError`                         | Build `textStream` / `final()`-style handles or minimal `UnifiedResponse` error payloads (see runtime in repo).          |


---

## Errors & runtime


| Situation                               | Behavior                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| **Batch (`stream: false`)** and non-2xx | Throws `Error` with `Request failed with status {n}: {body}`.                  |
| **Stream (`stream: true`)** and non-2xx | Throws before SSE parsing; message includes response body when available.      |
| **Stream pump failure**                 | The `events` async iterator may reject; `final()` rejects with the same cause. |
| **Missing body**                        | Streaming throws if the response has no body.                                  |


**Legacy SSE:** the client parser also accepts older frames: `event: text` (delta JSON), `event: final` (full `UnifiedResponse`), and `event: error`. Prefer unified JSON `data` with a `type` field when you control the server.

---

## appendAssistantFromUnifiedResponse

**What.** `appendAssistantFromUnifiedResponse(messages, response, options?)` returns a **new** `message[]`: prior messages plus one `role: "assistant"` turn built from `UnifiedResponse`. It delegates to `unifiedResponseToAssistantMessage` with the same mapping rules.

**What it does not do.** It does **not** append `role: "tool"` rows. After the model requests tools, you run `execute`, push `toolExecutionToMessage` (once per call), then call `generate` again. Order for one agent step: assistant turn (this helper) → tool turn(s) → next request.

**How assistant content is built (same as `unifiedResponseToAssistantMessage`).**

- Walk `response.content` in order → assistant blocks: `text`, `reasoning` → `thinking`, `tool-call` → `toolcall` (ids + args for history).
- If `response.text` is set but no text part exists in `content`, **prepend** one text block from `response.text`.
- Merge `response.toolCalls` that never appeared in `content` (by `id`) so history lists every call.

`**options` (optional).**


| Field       | When                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `provider`  | Pass when `response.providerMetadata?.provider` is missing — otherwise `unifiedResponseToAssistantMessage` throws. |
| `timestamp` | Override assistant `timestamp` (default `Date.now()`).                                                             |
| `usage`     | Override usage when the stream omitted tokens — defaults to `response.usage`, else `emptyUsage()`.                 |


**Where to use.**


| Situation          | Pattern                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Batch run          | `appendAssistantFromUnifiedResponse(messages, result.response)` after `stream: false`.                                                                                               |
| Stream run         | `const response = await result.final()` (or `done.response`), then the same helper — do not treat partial mid-stream snapshots as final unless you mean to persist incomplete turns. |
| Tool loop          | Each `generate` that completes an assistant step → append assistant → append tool result(s) → `generate` again.                                                                      |
| UI-only transcript | Prefer reading `UnifiedResponse` directly if you do not send history back to the API.                                                                                                |


**Best practices.**

- **One append per completed `UnifiedResponse`** for that turn — do not append the same `response` twice.
- With `stream: true`, wait for `final()` or the terminal `done` event before appending so `content`, `toolCalls`, and `finishReason` match the finalized run.
- Set `options.provider` to the same `provider` as the request when metadata is sometimes empty (common in streaming).
- For tool rows, use `toolExecutionToMessage` with `toolCallId: call.callId ?? call.id` so tool results line up with assistant `toolcall` blocks.

**Prefer `unifiedResponseToAssistantMessage` alone** when you only need the assistant object (for example to store one message in a database without copying the full `messages` array).

---


## UnifiedResponse

Normalized final payload for batch and stream:


| Field                       | Meaning                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `status`                    | `RunStatus` (`completed`, `requires_action`, `failed`, …)  |
| `text`                      | Final assistant text shortcut                              |
| `content`                   | `ResponseContentPart[]` (text, reasoning, tool-call)       |
| `toolCalls`                 | Calls (including calls not duplicated in `content`)        |
| `approvals`                 | Pending / resolved approvals                               |
| `usage` / `finishReason`    | Tokens + stop reason                                       |
| `providerMetadata`          | Ids, model, raw finish                                     |
| `warnings` / `errorMessage` | Soft warnings / error text                                 |
| `object`                    | Optional opaque provider object / raw payload when present |


---

## generate() streaming events

`generate({ stream: true })` returns `events: AsyncIterable<UnifiedStreamEventType>` — raw provider events for a single turn. Switch on `event.type` in TypeScript for full autocomplete and type narrowing. The SSE `event:` line matches the `type` field.

`UNIFIED_STREAM_EVENT_TYPE_VALUES` is a `const` array of every event `type` string — use it for exhaustive checks or tests.

### Shared fields on many events


| Field          | Type              | Meaning                                                                                           |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `partial`      | `UnifiedResponse` | Run snapshot so far. **Not** on `done` / `error`.                                                 |
| `contentIndex` | `number`          | Assistant block index (0-based). On `*_start` / `*_delta` / `*_end` **except** `start`.           |
| `delta`        | `string`          | Chunk. Only `text_delta`, `thinking_delta`, `toolcall_delta`.                                     |
| `content`      | `string`          | Full segment end. `text_end`, `thinking_end` only; `toolcall_end` uses `toolCall`, not `content`. |


Terminal frames: `done` carries `response`; `error` carries `error` — **no** `partial`.

---

### `start`

First frame.


| Property  | Type              | Notes                                     |
| --------- | ----------------- | ----------------------------------------- |
| `type`    | `"start"`         | Matches SSE `event:`                      |
| `partial` | `UnifiedResponse` | Initial snapshot (sparse OK; fills later) |


No `contentIndex` / `delta`.

---

### Text: `text_start` → `text_delta` → `text_end`

One assistant text segment per `contentIndex`.


| Event          | Props                                        | Notes                    |
| -------------- | -------------------------------------------- | ------------------------ |
| **text_start** | `type`, `contentIndex`, `partial`            | Opens block at index     |
| **text_delta** | `type`, `contentIndex`, `delta`, `partial`   | Append `delta`           |
| **text_end**   | `type`, `contentIndex`, `content`, `partial` | Full `content` for block |


---

### Reasoning: `thinking_start` → `thinking_delta` → `thinking_end`

Same pattern as text; provider-dependent.


| Event              | Props                                        | Notes                 |
| ------------------ | -------------------------------------------- | --------------------- |
| **thinking_start** | `type`, `contentIndex`, `partial`            | Opens reasoning block |
| **thinking_delta** | `type`, `contentIndex`, `delta`, `partial`   | Chunks                |
| **thinking_end**   | `type`, `contentIndex`, `content`, `partial` | Full reasoning string |


---

### Tool calls: `toolcall_start` → `toolcall_delta` → `toolcall_end`

One invocation per `contentIndex` (arguments often stream as JSON).


| Event              | Props                                         | Notes                                                                                                             |
| ------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **toolcall_start** | `type`, `contentIndex`, `partial`             | Segment open                                                                                                      |
| **toolcall_delta** | `type`, `contentIndex`, `delta`, `partial`    | Argument chunk                                                                                                    |
| **toolcall_end**   | `type`, `contentIndex`, `toolCall`, `partial` | `toolCall` is `ResponseToolCallPart` (`id`, `callId`, `name`, `arguments`, …). Use with `toolExecutionToMessage`. |


---

### `approval_required`

Tool `requiresApproval` + human gate.


| Property   | Type                  | Notes                                                                                                      |
| ---------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `type`     | `"approval_required"` |                                                                                                            |
| `approval` | `ApprovalRequest`     | `id`, `runId`, `toolCallId`, `toolName`, `input`, `status`, `rejectionMode`, optional `reason`, `metadata` |
| `partial`  | `UnifiedResponse`     | Snapshot with pending approval                                                                             |


---

### `done`

Success end. **No `partial`** — `response` only.


| Property   | Type                      | Notes                                              |
| ---------- | ------------------------- | -------------------------------------------------- |
| `type`     | `"done"`                  |                                                    |
| `reason`   | `UnifiedStreamDoneReason` | `"stop"`, `"length"`, `"toolUse"`                  |
| `response` | `UnifiedResponse`         | Final payload; `final()` resolves with this object |


---

### `error`

Fail or abort. **No `partial`** — `error` only.

| Property | Type                     | Notes                                       |
| -------- | ------------------------ | ------------------------------------------- |
| `type`   | `"error"`                |                                             |
| `reason` | `"error"` or `"aborted"` | Hard error vs cancel                        |
| `error`  | `UnifiedResponse`        | Error payload (`status`, `errorMessage`, …) |

---

## run() streaming events

`run({ stream: true })` returns `events: AsyncIterable<RunStreamEvent>`.

`RunStreamEvent` is a **superset** of `UnifiedStreamEventType` — every event from `generate()` is forwarded as-is from each turn, plus five run-loop lifecycle events injected between turns:

```ts
type RunStreamEvent =
  | UnifiedStreamEventType   // all generate() events, forwarded from each turn
  | RunTurnStartEvent        // "run_turn_start"
  | RunToolExecutingEvent    // "run_tool_executing"
  | RunToolExecutedEvent     // "run_tool_executed"
  | RunTurnEndEvent          // "run_turn_end"
  | RunCompleteEvent         // "run_complete"
```

### Event flow for a two-turn agent run

```
run_turn_start       iteration: 0
  start              ← forwarded from generate()
  toolcall_start     ← model begins a tool call
  toolcall_delta     ← arguments streaming in
  toolcall_end       ← tool call complete
  done               ← reason: "toolUse"
run_tool_executing   ← execute() is about to run locally
run_tool_executed    ← execute() returned, result ready
run_turn_end         iteration: 0, toolResults: [...]

run_turn_start       iteration: 1
  start
  text_start
  text_delta         ← final answer streaming in
  text_end
  done               ← reason: "stop"
run_turn_end         iteration: 1, toolResults: []
run_complete         ← full loop finished
```

### `run_turn_start`

Fires at the beginning of each `generate()` call in the loop. Use it to show a thinking indicator.

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"run_turn_start"` | |
| `iteration` | `number` | Zero-based turn index |

### `run_tool_executing`

Fires just before a tool's `execute()` is called locally. Use it to show "Running grep…" before the result is ready.

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"run_tool_executing"` | |
| `iteration` | `number` | Turn index |
| `toolName` | `string` | Name of the tool |
| `toolCallId` | `string` | `callId ?? id` from the model's tool call |
| `arguments` | `unknown` | Decoded arguments the model passed |

### `run_tool_executed`

Fires after `execute()` completes or throws. Use it to display the result or error inline.

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"run_tool_executed"` | |
| `iteration` | `number` | Turn index |
| `toolName` | `string` | |
| `toolCallId` | `string` | |
| `result` | `unknown` | Return value from `execute()`, or an error message string |
| `isError` | `boolean` | `true` if `execute()` threw or tool had no `execute` function |

### `run_turn_end`

Fires after all tools for a turn have been executed and results appended to history.

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"run_turn_end"` | |
| `iteration` | `number` | Turn index |
| `response` | `UnifiedResponse` | Completed assistant response for this turn |
| `toolResults` | `ToolResultMessage[]` | Tool results executed this turn. Empty on the final stop turn. |

### `run_complete`

Fires once when the entire loop finishes. Carries the same data as `RunResult`.

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"run_complete"` | |
| `response` | `UnifiedResponse` | Final assistant response |
| `messages` | `message[]` | Full conversation history |
| `iterations` | `number` | Total `generate()` calls made |

---

