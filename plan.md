# Unified Response Layer Plan

## Goal

Implement the first execution-ready version of the unified response layer for `package/ai`, starting with `openai-codex`, while keeping the API simple, stream-friendly, and future-safe for chat apps, coding agents, harnesses, and other advanced use cases.

This plan focuses on the response side only. The request-side unified layer and Codex request compiler already exist and are working.

## Current State

- The public request shape exists in `package/ai/types.ts` and provider-specific request narrowing exists for Codex.
- The Codex request compiler exists in `package/ai/providers/openai-codex/compile-request.ts`.
- The machine route validates the request, resolves the model, compiles the provider payload, fetches provider credentials, sends the upstream request, and currently passes the upstream stream through as-is in `apps/web/app/machine/service.ts`.
- Real OpenAI Codex SSE response samples have been captured for:
  - plain text
  - a tool-oriented prompt that still returned plain text
  - a reasoning-oriented prompt that still returned plain text

## Locked Public Response Surface

The public response surface we are moving toward is:

- `text`
- `object`
- `textStream`
- `objectStream`
- `toolCalls`
- `toolResults`
- `usage`
- `finishReason`
- `content`
- `providerMetadata`
- `warnings`
- `final()`

### Intended mode narrowing

**`stream` is user-controlled, not forced.** Product default may be `stream: true` when the caller omits it, but if the user sets `stream: false` or `stream: true`, **the unified layer respects that**. When a provider’s upstream API is SSE-only, `stream: false` is implemented by **collecting the streamed response internally** and still exposing the same unified result shape (main field `text` or `object`, plus `final()` semantics as appropriate)—not by rejecting the request unless we truly cannot satisfy the contract.

#### Case 1: `stream: false`, no `schema`

- main field: `text`

#### Case 2: `stream: true`, no `schema`

- main field: `textStream`
- universal completion helper: `final()`

#### Case 3: `stream: false`, with `schema`

- main field: `object`

#### Case 4: `stream: true`, with `schema`

- main field: `objectStream`
- universal completion helper: `final()`

Shared fields like `toolCalls`, `toolResults`, `usage`, `content`, `providerMetadata`, `warnings`, and `finishReason` can exist across modes, but some will only be complete at the end of the run.

## Locked Semantic Decisions

### `text`

- Final user-facing readable assistant answer only.
- Does not contain tool call payloads.
- Does not directly expose raw provider lifecycle data.
- If reasoning is ever exposed separately, `text` should still represent the answer text, not the entire rich output transcript.

### `object`

- Final validated structured result when `schema` is provided.
- Not derived from a raw provider object shape.
- Comes from parsing/validating the response according to the caller-provided schema.

### `content`

- Canonical rich output surface.
- Ordered normalized content parts.
- Intended to be the source of truth for higher-level projections.
- Current planned part families:
  - `text`
  - `reasoning`
  - `tool-call`
  - `tool-result`

### `toolCalls`

- Normalized tool invocation records.
- Should be usable by agent UIs, logs, approval systems, and orchestration code.

### `toolResults`

- Normalized executed tool result records.
- Separate from `text`.
- Separate from assistant-authored content.

### `final()`

- Returns the fully assembled final snapshot of the generation.
- Especially important in streaming mode.
- Serves as the universal escape hatch regardless of `stream` and `schema`.

### `finishReason`

- Unified normalized reason why generation ended.
- Candidate values currently include:
  - `stop`
  - `length`
  - `tool-call`
  - `content-filter`
  - `error`
  - `abort`

- **Naming alignment with existing chat types:** `package/ai/types.ts` uses `StopReason` on messages (`max_tokens`, `toolUse`, …). The unified response layer uses **`finishReason`** with the vocabulary above. At the boundary (e.g. when projecting into chat history), **map explicitly**—do not merge the two enums without a documented table.

### `providerMetadata` (policy — locked for v1)

We split **what is safe to expose by default** from **what is for debugging or compliance**:

| Layer | What it is | Default in API |
| ----- | ---------- | -------------- |
| **Curated `providerMetadata`** | Small, stable, schema-defined fields: provider name, upstream `responseId` / message ids if available, resolved model id, stream status, vendor **non-sensitive** ids (e.g. OpenAI response id string), and **summaries** (e.g. completion status string from `response.completed`). | **Always** returned when present. |
| **`rawCompletedResponse`** (accumulator) | Full parsed JSON of the final `response.completed` payload (or last snapshot), typed as `unknown` / JSON-safe. | **Not** exposed on the default public snapshot unless the caller opts in (see below). |
| **Opt-in raw for debugging** | Same blob or full SSE transcript for support. | Gated: e.g. `request.debug?.includeRawProviderPayload` (name TBD) **or** server-side allowlist (env / internal users only). Never default in production clients. |

**Rules:**

- **Never** put access tokens, refresh tokens, or credential blobs in `providerMetadata` or unified responses.
- Prefer **one curated struct** (Effect `Schema`) for `providerMetadata` so the SDK stays typed; add fields only when they are stable across runs.
- If we need a “dump everything” escape hatch for a specific provider, put it under **`providerMetadata.extensions.openaiCodex`** (or similar) and document it as **unstable**, not as part of the core contract.

### Codex → unified `finishReason` (alignment table — v1)

Map **upstream signals** to the unified enum. Exact Codex field paths should be **filled from captured fixtures** when implementing `response.completed` parsing; the **unified** column is authoritative for SDK consumers.

| Condition (upstream / stream lifecycle) | Unified `finishReason` | Notes |
| --------------------------------------- | ---------------------- | ----- |
| `response.completed` with normal successful end-of-generation (no error, not truncated for length) | `stop` | Default happy path. |
| Completed with **max output / length** semantics (token limit, `incomplete` due to length—confirm field names in fixture) | `length` | Distinct from generic `error`. |
| Completed with **tool invocation** as the stopping reason (when tools exist upstream) | `tool-call` | Phase 7+ when tool events are real. |
| Content policy / moderation stop (if Codex exposes it on completed payload) | `content-filter` | If absent in API, reserve and map later. |
| Provider or transport **error** (non-2xx, error object on completed, explicit failure event) | `error` | Pair with `warnings` or structured error in machine layer. |
| Caller **`AbortSignal`** aborted the request | `abort` | Propagate from machine/upstream cancellation. |
| **Stream ends without `response.completed`** (incomplete stream) | `error` | See [Error path matrix](#error-path-matrix-effect-first). |
| **Malformed SSE** (line not JSON, invalid envelope, unrecognized required shape) | `error` | See [Error path matrix](#error-path-matrix-effect-first). |

**Maintenance:** When OpenAI/Codex changes event shapes, update this table and remapper tests in the same PR.

**Rationale — the two “product contract” decisions:**

1. **`providerMetadata`:** Curated-by-default keeps the SDK stable and avoids leaking prompts, tokens, or huge blobs. Full completion JSON stays in **`rawCompletedResponse`** for debugging and golden tests, and crosses the public API boundary only when explicitly requested (support / internal tools).
2. **`finishReason`:** One **unified** enum keeps chat UI, agents, and analytics consistent across providers; Codex-specific strings live only inside the remapper and are **normalized** through the alignment table. Stream lifecycle cases (abort, incomplete, parse failure) are defined here so they are not re-decided per PR.

## What We Know About Codex Upstream Streaming

From real captured OpenAI Codex responses, the text path currently emits these events:

- `response.created`
- `response.in_progress`
- `response.output_item.added`
- `response.content_part.added`
- `response.output_text.delta`
- `response.output_text.done`
- `response.content_part.done`
- `response.output_item.done`
- `response.completed`

### Important current findings

- The current real samples only prove text-first streaming.
- The tool-oriented sample did not produce tool-call events because no actual tools were present upstream.
- The reasoning-oriented sample did not produce separate reasoning events; the answer still came through normal text deltas.
- So the first implementation should treat text streaming as the proven path and keep room for future extension.

## Mapping Strategy

We should not expose raw OpenAI/Codex events to the SDK user.

Instead, we should:

1. read the raw provider stream
2. parse provider SSE events
3. update one internal accumulator state
4. immediately forward normalized chunks to the frontend-facing stream abstraction
5. resolve the final unified snapshot on completion

This is not batch buffering. This is live remapping with parallel accumulation.

### Core rule

For every upstream event:

1. parse
2. map
3. emit outward immediately
4. update accumulator

## Effect and first-class failures

**`@hax/ai` already uses the Effect ecosystem:** `package/ai/package.json` depends on `effect`, and `package/ai/types.ts` uses **`Schema` from `effect`** for request and shared types. The response remapper should **continue the same stack**—`Schema` for decoding provider events where appropriate, **tagged errors**, and **Effect** for stream consumption and remapping—rather than introducing a parallel error model.

The machine route also uses **Effect** (`apps/web/app/machine/service.ts`): typed errors, structured logging, and tracing. End-to-end, failures stay typed and observable.

**Principles:**

- **Tagged errors** for remapper-specific failures (e.g. `SseLineParseError`, `SseIncompleteStreamError`, `CodexEventSchemaError`) so every bad path is **named**, loggable, and testable.
- **Effect** for consuming the upstream `ReadableStream`, parsing each SSE line, folding events into the accumulator, and emitting outbound chunks. **Fail the Effect** on malformed or incomplete streams instead of returning partial success with no signal.
- **Unified surface:** When the Effect fails, the outer layer maps to HTTP/SDK behavior: e.g. **502** for bad upstream body, **500** for internal remapper bug, and/or a **terminal unified chunk** with `finishReason: "error"` + `warnings` if we choose to **end the stream gracefully** instead of resetting the connection (product decision per route).

**Why:** Malformed SSE and incomplete streams become **explicit failures** in the type system and in logs—not silent empty `text` or hung streams.

## Error path matrix (Effect-first)

Use this matrix when implementing `map-response.ts` and the machine wire-up. Adjust HTTP status codes to match existing `MachineError` patterns.

| Scenario | What happens (parse / map) | Effect failure (tag) | Unified outcome | Client / user |
| -------- | -------------------------- | --------------------- | ----------------- | ------------- |
| SSE line is not valid JSON | Fail at parse step | e.g. `SseLineParseError` | `finishReason: "error"` if graceful end; else HTTP 502 | Clear failure; never infinite spin |
| JSON parses but **not** a Codex event envelope | Fail schema decode | e.g. `CodexEventSchemaError` | Same as above | Same |
| Valid events then **TCP close** before `response.completed` | Detect EOF in incomplete state | e.g. `SseIncompleteStreamError` | `finishReason: "error"` + warning `"stream ended before completion"` | User sees error terminal state |
| Upstream **200** but body is HTML / non-SSE | First read fails or no `data:` lines | `UpstreamError` or parse error | 502 / error | Matches existing machine behavior |
| Upstream **4xx/5xx** | Before remapper | Existing `UpstreamError` / `RateLimitError` | 401/429/502… | Unchanged |
| **Duplicate** `response.created` or impossible ordering | Defensive check in reducer | e.g. `CodexStreamStateError` | `finishReason: "error"` | Logged; tests required |
| **AbortSignal** fires mid-stream | Cancel reader | Map to `finishReason: "abort"` if we emit a final snapshot; else connection reset | User cancelled |

**Tests:** Each row should have at least one **fixture or unit test**; “incomplete stream” and “malformed line” are **mandatory**.

## Internal Accumulator State

Create one internal mutable response accumulator for the provider run.

### Minimum fields

- `responseId`
- `messageId`
- `provider`
- `model`
- `status`
- `text`
- `content`
- `toolCalls`
- `toolResults`
- `usage`
- `finishReason`
- `providerMetadata`
- `warnings`
- `rawCompletedResponse`

### Purpose of the accumulator

- build `text`
- build `object`
- build `content`
- collect `toolCalls`
- collect `toolResults`
- attach `usage`
- attach `finishReason`
- power `final()`

## Event-to-Unified Mapping for the Proven Text Path

### `response.created`

Update accumulator:

- set `responseId`
- set `provider`
- set `model`
- set status to `in_progress`
- capture initial provider metadata

Forward behavior:

- initialize live result handles
- do not wait for completion

### `response.in_progress`

Update accumulator:

- refresh status

Forward behavior:

- usually internal only

### `response.output_item.added`

Update accumulator:

- create current assistant message context
- set `messageId`

Forward behavior:

- initialize content/message state for streaming consumers

### `response.content_part.added`

Update accumulator:

- create a new normalized content part
- if provider part is `output_text`, create a `text` content entry with empty text

Forward behavior:

- initialize text streaming state

### `response.output_text.delta`

Update accumulator:

- append delta to `text`
- append delta to current text content part

Forward behavior:

- push delta into `textStream` immediately
- if schema mode is active, attempt incremental object parsing for `objectStream` when practical

### `response.output_text.done`

Update accumulator:

- finalize current text content part
- finalize current text buffer for the active part

Forward behavior:

- complete the current text stream segment

### `response.content_part.done`

Update accumulator:

- mark current content part done

Forward behavior:

- mostly internal for now

### `response.output_item.done`

Update accumulator:

- finalize current assistant output item

Forward behavior:

- close message-level state for this output item

### `response.completed`

Update accumulator:

- set final status
- map usage
- map finish reason (using the **Codex → unified `finishReason`** alignment table in this document)
- populate **curated** `providerMetadata` (ids, status, safe vendor fields—see **`providerMetadata` policy** in this document)
- store full payload in **`rawCompletedResponse`** for internal/`final()`; expose raw to clients only when **opt-in** debug flag is set

Forward behavior:

- close live streams
- resolve `final()`

## Proposed File-Level Execution Plan

### Phase 1: Lock the response-layer contract in code

Create or update response-side schemas/types for:

- final result shape
- content part shapes
- tool call/result shapes
- usage shape if needed separately
- finish reason shape

Recommended location:

- `package/ai/types.ts` for shared response primitives
- provider-specific additions only if needed later

### Phase 2: Build the Codex response parser/remapper

Create a provider-specific response remapper.

Recommended file:

- `package/ai/providers/openai-codex/map-response.ts`

Responsibilities:

- read raw SSE stream (**Effect**-based consumption; same `effect` dependency and patterns as `package/ai/types.ts`; see **Effect and first-class failures** above)
- parse provider events
- maintain accumulator state
- write normalized live output
- produce final snapshot
- on failure paths in the **error path matrix** below, **fail explicitly** (no silent partial success)

### Phase 3: Introduce a streaming result handle abstraction

Build the object that `hax.generate()` should ultimately expose in streaming mode.

Minimum responsibilities:

- `textStream`
- `objectStream` when schema exists
- `final()`
- live-updating references/collections for:
  - `toolCalls`
  - `toolResults`
  - `usage`
  - `providerMetadata`
  - `warnings`

### Phase 4: Wire the machine route to the remapper

Current behavior:

- upstream response is passed through directly

Target behavior:

- machine route uses Codex response remapper
- frontend receives normalized streamed chunks, not raw provider SSE

Main integration point:

- `apps/web/app/machine/service.ts`

### Phase 5: Add final result assembly

When the provider completes:

- finalize the accumulator
- resolve `final()`
- make sure final text/content/usage/provider metadata are stable and complete

### Phase 6: Add schema/object support

After text-first streaming works:

- parse final text into `object` when `schema` exists
- support incremental `objectStream` where practical
- decide fallback behavior when incremental object parsing is impossible or unstable

### Phase 7: Add real tool-call remapping

Only after capturing real provider tool-call stream shapes.

Implement:

- normalized `toolCalls`
- normalized `toolResults`
- content part support for tool-call and tool-result parts

### Phase 8: Add reasoning/remapped reasoning support

Only after capturing real provider reasoning events or content parts.

Implement:

- normalized reasoning content parts
- decide whether reasoning should project into a separate helper later or live only inside `content`

## Testing Plan

### Existing strengths

- request compiler tests already exist
- machine request proxy tests already exist

### New tests to add

#### Provider remapper unit tests

- parse captured Codex SSE fixtures
- assert text accumulation
- assert `textStream` output sequence
- assert final snapshot fields
- assert finish reason and usage mapping
- **error path matrix:** malformed SSE line (non-JSON) → tagged Effect failure / terminal `finishReason: "error"` (per chosen wire strategy)
- **error path matrix:** stream ends before `response.completed` → `SseIncompleteStreamError` (or equivalent) and unified `finishReason: "error"` + warning
- optional: duplicate-event / invalid-order fixture → `CodexStreamStateError` or equivalent

#### Machine integration tests

- route returns normalized stream, not raw provider events
- frontend-facing output arrives incrementally
- final result resolves correctly

#### Schema/object tests

- final `object` success path
- invalid object parse path
- partial/incremental object streaming behavior

#### Future tool tests

- real tool call start/args/end mapping
- tool result mapping
- `toolCalls` and `toolResults` collections update correctly

## Open Questions To Resolve During Implementation

### 1. `providerMetadata` + raw payload — **resolved for v1**

See **`providerMetadata` (policy — locked for v1)** and **`rawCompletedResponse`** rules above: curated public metadata by default; full raw completion payload only with explicit opt-in (debug / allowlisted use).

### 2. What should `content` look like exactly?

We have the conceptual part families, but still need to lock exact normalized shapes.

### 3. `finishReason` mapping from Codex — **policy resolved; fields TBD**

See **Codex → unified `finishReason` (alignment table — v1)**. The **unified enum and lifecycle rules** (incomplete stream → `error`, etc.) are locked. **Exact Codex JSON keys** for “length vs stop” must be confirmed from `response.completed` fixtures when implementing.

### 4. How aggressive should incremental object parsing be?

Need to decide whether `objectStream` emits:

- partial parsed snapshots
- or only validated milestones

### 5. Non-streaming (`stream: false`) vs Codex upstream

**Contract:** Callers choose `stream: true` or `stream: false`; default can be `true` at the SDK/app layer when unset. **We respect their choice.**

**Implementation:** Codex may speak SSE to the machine even when the user asked for `stream: false`. In that case the implementation **collects the SSE internally**, runs the same remapper/accumulator, and returns a **non-streaming** unified result (e.g. full `text` / `object` and `final()`-equivalent snapshot) without requiring the caller to pass `stream: true`.

**Note:** Until the machine route is updated, it may still reject some combinations; the **target** behavior is the above, not “force `stream: true` on the user.”

## Recommended Immediate Next Step

Implement the Codex response remapper for the text-first path only.

That means:

- parse the current proven Codex SSE event sequence
- accumulate `text`, `content`, `usage`, `providerMetadata`, and `finishReason`
- push `textStream` chunks live to the frontend
- resolve `final()` at completion

Do not block on tool-call or reasoning remapping yet.
Those should be added after collecting real upstream event samples for them.

## Definition of Done for the First Response Milestone

The first response milestone is done when:

- a unified request reaches the machine route
- it is compiled to Codex successfully
- Codex responds with SSE
- the backend remaps raw provider events into the Hax unified response stream
- the frontend receives text chunks live, not batched at the end
- `final()` resolves to a complete final result
- final result includes at least:
  - `text`
  - `content`
  - `usage`
  - `finishReason`
  - `providerMetadata` (**curated** fields per policy; not raw-by-default)
- remapper tests cover **malformed SSE** and **incomplete stream** rows from the error path matrix
