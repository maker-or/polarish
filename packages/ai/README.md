# @polarish/ai

TypeScript SDK for a **unified chat API**: one request shape (`appRequestShape`), one final payload (`UnifiedResponse`), and Server-Sent Events (`UnifiedStreamEvent`) with pi-mono-style `for await` over `events`.

---

## Table of contents

1. [Who this is for](#who-this-is-for)
2. [Installation & dependencies](#installation--dependencies)
3. [Create a client](#create-a-client)
4. [Session tokens](#session-tokens)
5. [Send a request](#send-a-request)
6. [Request shape (`appRequestShape`)](#request-shape-apprequestshape)
7. [Messages, attachments, and tool IDs](#messages-attachments-and-tool-ids)
8. [Defining tools](#defining-tools)
9. [Tools and agent loops](#tools-and-agent-loops)
10. [Backend & testing exports](#backend--testing-exports)
11. [Errors & runtime](#errors--runtime)
12. [appendAssistantFromUnifiedResponse](#appendassistantfromunifiedresponse)
13. [Non-streaming vs streaming results](#non-streaming-vs-streaming-results)
14. [UnifiedResponse](#unifiedresponse)
15. [TypeScript: stream events](#typescript-stream-events)
16. [Streaming events reference](#streaming-events-reference)

---

## Who this is for


| You are…                                                                  | Start here                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Building an app** that talks to your deployed machine API               | `[create()](#create-a-client)` → `client.generate()`, `[appRequestShape](#request-shape-apprequestshape)`, [tools & loops](#tools-and-agent-loops), [streaming](#streaming-events-reference). |
| **Implementing or adapting the HTTP machine** (proxy, tests, custom auth) | `[generate()](#send-a-request)` (low-level), `[compileRequest](#backend--testing-exports)`, Codex bridge helpers in [Backend & testing exports](#backend--testing-exports).                   |


The generic `requestShape` in `types.ts` documents the broader message/history union. `**generate` and `client.generate` only accept `appRequestShape`** today (`provider: "openai-codex"` + `model` from the Codex model list).

---

## Installation & dependencies

```bash
bun add @polarish/ai
```

**Peer:** `typescript` ^5. `**zod`** is optional at runtime (listed as a peer with `optional: true`); use it for tool schemas, or JSON Schema / Effect / shorthand as in [Defining tools](#defining-tools).

**Runtime:** a global `**fetch`** implementation is required (`generate` throws if `fetch` is missing).

---

## Create a client

`create(options)` returns a `Client` with a single method: `generate(request)` where `request` matches `appRequestShape`.

- **Endpoint:** `POST` `{baseUrl}/api/v1/chat/completions` (trailing slash on `baseUrl` is optional).
- **Auth:** `Authorization: Bearer {accessToken}` on every request.
- **401 / expired access:** if `refreshToken`, `clientId`, and `clientSecret` are set, the client refreshes OAuth, updates in-memory tokens, calls `onSessionTokens` when provided, then **retries the request once**.

Set a real `**baseUrl`** for your API. If you omit it, the SDK falls back to an internal placeholder origin—**not** suitable for production.

```ts
import { create } from "@polarish/ai";

const client = create({
  accessToken: process.env.POLARISH_ACCESS_TOKEN!,
  refreshToken: process.env.POLARISH_REFRESH_TOKEN!,
  clientId: process.env.POLARISH_CLIENT_ID!,
  clientSecret: process.env.POLARISH_CLIENT_SECRET!,
  /** Origin of your API (trailing slash optional). */
  baseUrl: "https://api.example.com",
  /**
   * Called with `SessionTokens` whenever the SDK applies a new pair (from `response.sessionTokens`
   * or after OAuth refresh). Persist both tokens.
   */
  onSessionTokens: async ({ accessToken, refreshToken }) => {
    await saveTokens({ accessToken, refreshToken });
  },
});
```

---

## Session tokens

When the backend returns `sessionTokens` on a completed run, persist them so the next request stays authenticated.


| Mode                | When tokens are applied                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**stream: false**` | `result.response.sessionTokens` after a successful JSON response.                                                                                                          |
| `**stream: true**`  | On the terminal `done` event (`done.response.sessionTokens`), and again when you await `result.final()` (the client wraps the stream so both paths run `onSessionTokens`). |


If you use the low-level `[generate()](#send-a-request)` without `create()`, you must apply `sessionTokens` yourself from the batch response or from `done` / `final()`.

---

## Send a request

### `client.generate` (typical)

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
```

### `generate` (low-level, same wire contract)

Use this for **tests**, **custom headers**, or **token handling** outside `create()`:

```ts
import { generate } from "@polarish/ai";

const result = await generate(
  {
    provider: "openai-codex",
    model: "gpt-5.4",
    system: "…",
    messages: [{ role: "user", content: "Hi." }],
    stream: false,
    temperature: 0.8,
    maxRetries: 2,
  },
  {
    endpoint: "https://api.example.com/api/v1/chat/completions",
    headers: { authorization: "Bearer …" },
  },
);
```

Batch and stream result shapes match `client.generate`. See [Non-streaming vs streaming results](#non-streaming-vs-streaming-results).

---

## Request shape (`appRequestShape`)

Codex-backed unified API:


| Field         | Type               | Notes                                                                        |
| ------------- | ------------------ | ---------------------------------------------------------------------------- |
| `provider`    | `"openai-codex"`   | Required today                                                               |
| `model`       | `CodexModelId`     | e.g. `gpt-5.4` — import `CodexModelId` from `@polarish/ai/openai-codex`      |
| `system`      | `string`           | System / developer instructions                                              |
| `messages`    | `message[]`        | User, assistant, tool turns — [Messages](#messages-attachments-and-tool-ids) |
| `tools`       | `ToolDefinition[]` | Optional — [Defining tools](#defining-tools)                                 |
| `stream`      | `boolean`          | `false` → JSON body; `true` → SSE unified stream                             |
| `temperature` | `number`           | Sampling                                                                     |
| `maxRetries`  | `number`           | SDK / transport retry hint                                                   |
| `signal`      | `AbortSignal?`     | Abort HTTP                                                                   |


---

## Messages, attachments, and tool IDs

### Message roles

`message` is a union:

- `**{ role: "user", content, timestamp? }**` — `content` is a string or an array of blocks (`TextContent`, `AttachmentContent`, …).
- `**{ role: "assistant", … }**` — assistant turn for history: text, optional thinking (`ThinkingContent`), and `**toolcall**` items (`Toolcall`).
- `**{ role: "tool", toolCallId, toolName, content, isError, … }**` — after you run a tool locally (`execute`), one row per tool result.

For the next request, append assistant output and tool results **in order**.

### Attachments (multimodal user input)

User content may include `AttachmentContent`: `kind` (`image` | `audio` | `video` | `document`), `mimetype`, optional `filename`, and `source` — `{ type: "base64", data }`, `{ type: "url", url }`, or `{ type: "file_id", fileId }`.

Which models accept attachments is reflected in the `**openaiCodex`** catalog (see [Backend & testing exports](#backend--testing-exports)): each model lists `input: ["text"]` and/or `"attachment"`. For example, `gpt-5.3-codex-spark` is text-only in that registry.

### Tool call IDs (OpenAI-style)

On a tool-call part, `**id`** is the provider output item id (e.g. `fc_…`); `**callId**` (when present) is the correlation id (e.g. `call_…`) that pairs with tool results. When building a tool result message, use:

`toolCallId: call.callId ?? call.id`

so history matches what the provider expects.

### Tool result text

`toolExecutionToMessage` stringifies non-string `result` values with `JSON.stringify` for the `role: "tool"` text block.

---

## Defining tools

Put `ToolDefinition` values on `tools`. For agent loops you typically provide `**name**`, `**description**`, `**inputSchema**`, and `**execute**`. The hosted model does not run `execute`—your loop does after `tool-call` parts in `UnifiedResponse` (and after any approval flow).


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
4. Approve or reject through **your** backend (there is no separate SDK `approve()` — the contract lives in your `POST /api/v1/chat/completions` stack). Typically POST `id` + `runId` + approved/rejected so the run resumes or fails.
5. After approval → server continues → consume SSE until `done` or the next `approval_required`. When tool calls are finalized locally, run `execute`, then `toolExecutionToMessage`, update history, and call `generate` again if another turn is needed.
6. On rejection: `return_tool_error` sends an error to the model; `abort_run` stops the run — follow your `done` / `error` handling.

More: [Tools and agent loops](#tools-and-agent-loops), [Streaming events reference](#streaming-events-reference).

---

## Tools and agent loops

1. Send `ToolDefinition[]` with `name`, `description`, `inputSchema`, `execute`, and optional `requiresApproval`, `rejectionMode`, `outputSchema`, `retrySafe`, `metadata`.
2. Read `UnifiedResponse`: `content` and `toolCalls` for `tool-call` parts (ids — e.g. OpenAI `fc_…` / `call_…`).
3. `execute` with parsed args → `toolExecutionToMessage` (or a hand-built tool message).
4. `unifiedResponseToAssistantMessage` or `appendAssistantFromUnifiedResponse` + tool message(s) → `messages` → `generate` again.

`requiresApproval: true` → `approval_required` may appear before `execute` — [Handling approval_required](#handling-approval_required).

**History helpers** (`@polarish/ai`):


| Export                               | Does                                           |
| ------------------------------------ | ---------------------------------------------- |
| `unifiedResponseToAssistantMessage`  | `UnifiedResponse` → assistant `message`        |
| `appendAssistantFromUnifiedResponse` | Append assistant to `messages`                 |
| `toolExecutionToMessage`             | Build `role: "tool"` after `execute`           |
| `normalizeToolArgumentsForHistory`   | Normalize args for assistant `toolcall` blocks |
| `finishReasonToStopReason`           | Map finish reason → assistant `stopReason`     |
| `emptyUsage`                         | Zero `Usage` when the response omitted usage   |


---

## Backend & testing exports

Useful when **implementing** the machine API, **adapting** Codex streaming, or building **model pickers** in the UI:


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

## Non-streaming vs streaming results

`stream: false` → `UnifiedResponseBatchResult` — `result.stream === false` — use `result.response`.

`stream: true` → `UnifiedResponseStreamingResult`:

- `events` — `AsyncIterable<UnifiedStreamEventType>` (`start`, `text_delta`, `toolcall_end`, `done`, …). Narrow on `event.type` in TypeScript for safe field access.
- `textStream` — `ReadableStream<string>` (assistant text deltas only; driven by unified events).
- `final()` — `Promise<UnifiedResponse>` (same shape as batch `response`).

```ts
const result = await client.generate({ /* … */, stream: false });
if (!result.stream) {
  const text = result.response.text;
  const parts = result.response.content;
}
```

```ts
const result = await client.generate({ /* … */, stream: true });
if (result.stream) {
  for await (const event of result.events) {
    if (event.type === "text_delta") {
      process.stdout.write(event.delta);
    }
  }
  const final = await result.final();
}
```

Wire format: **SSE**. The `event:` line matches the payload `type`; see [Streaming events reference](#streaming-events-reference).

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
| `sessionTokens`             | Rotated pair when the backend renews tokens                |
| `warnings` / `errorMessage` | Soft warnings / error text                                 |
| `object`                    | Optional opaque provider object / raw payload when present |


---

## TypeScript: stream events

- `**UnifiedStreamEventType`** — discriminated union; switch on `event.type` for autocomplete-friendly handling.
- `**UNIFIED_STREAM_EVENT_TYPE_VALUES`** — `const` array of every event `type` string; use for exhaustive checks or tests (`as const satisfies` keeps it aligned with the union in the package).

---

## Streaming events reference

`stream: true` → response body is SSE. Prefer JSON `data` where the parsed object includes `type` (`UnifiedStreamEventType`). The `event:` line matches `type`.

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

