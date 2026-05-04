# Polarish Agent Skill

This skill document is written specifically for an AI coding agent. It contains everything you need to successfully use the Polarish packages (`@polarish/ai` and `@polarish/cli`) to build reliable AI workflows where users bring their own subscriptions.

Follow this document strictly. It prioritizes correctness, reliability under load, and predictable behavior.

## 1. Package Overview

Polarish has two packages that must work together:

- `@polarish/ai` — The TypeScript SDK you import in application code. It provides `create()`, `Client.generate()`, and `Client.run()`.
- `@polarish/cli` — The local bridge + CLI. The bridge runs an HTTP server (default `http://127.0.0.1:4318`) that the SDK talks to. It routes requests to the user's installed AI runtimes (Codex or Claude Code).

The SDK never calls provider APIs directly. All requests go through the local bridge.

**You must ensure the bridge is running** before any SDK calls succeed.

## 2. Initialization (Always Do This First)

```ts
import { create } from "@polarish/ai";

const client = create({
  baseUrl: "http://127.0.0.1:4318",           // Bridge URL
  origin: ["https://app.example.com", "http://localhost:3000"], // Required for security
});
```

**Rules for `create()`**:
- Always use one shared `client` instance for the entire application/session.
- `baseUrl` must point to the running bridge.
- `origin` is mandatory for security. During development, you **must** include the exact URL where your app runs (e.g. `http://localhost:3000`). The bridge uses this for CORS + allowlist checks.
- If you omit or use the wrong origin, the bridge will reject requests.

After creation, the client exposes:
- `client.generate(request)`
- `client.run(request, options)`

## 3. generate() vs run() — Choose Correctly

### Use `generate()` when:
- You want a single request/response.
- There are no tools, or you are handling tool calls manually.
- You do not need automatic retry loops.

### Use `run()` when:
- The request includes `tools` (local or MCP).
- You want the SDK to automatically handle the full agent loop: generate → execute tools → append results → generate again.
- You need `maxIterations` control and turn-level observation.

**Never use `generate()` with tools that have `execute` functions** — the loop will not run. Use `run()` instead.

## 4. Tool Definition Rules (Critical)

A valid tool must match this shape:

```ts
import { z } from "zod";

const myTool = {
  name: "my_tool",
  description: "What this tool does",
  inputSchema: z.object({ ... }),           // Zod, Effect, JSON Schema, or plain object
  execute: async (input: unknown) => { ... }, // REQUIRED for local execution
  retrySafe: true,                          // Optional
  requiresApproval: false,                  // Optional
  rejectionMode: "return_tool_error",       // or "abort_run"
};
```

**Strict rules**:
- `execute` **must** be a function if you want the SDK to run the tool locally.
- If `execute` is missing or not a function, `run()` will return a tool error message for that call.
- Use `call.callId ?? call.id` when creating tool result messages (see history helpers).
- `inputSchema` can be Zod, Effect, JSON Schema object, or plain JS object.
- For tools that should not be executed locally (e.g. pure MCP), omit `execute`.

**MCP Servers** (when tools live in external processes):
- Use the `mcpServers` field on the request instead of (or in addition to) `tools`.
- Example: `{ weather: { command: "npx", args: ["-y", "..."], env: {...} } }`
- Never pass untrusted commands.

## 5. Streaming Rules

When `stream: true`:

- `generate()` and `run()` return objects with an `events` async iterable and a `final()` method.
- You **must** consume the `events` iterable.
- Always call `await result.final()` (or listen for `run_complete`) to get the final state.
- Do not treat partial stream data as final state.
- On stream error, the `events` iterator rejects and `final()` rejects.

**Key events to handle**:
- `text_delta`, `thinking_delta`, `toolcall_delta`
- `run_turn_start`, `run_tool_executing`, `run_tool_executed`, `run_turn_end`, `run_complete`
- `approval_required`
- `error`

**Never** ignore the `error` event or let the stream be garbage collected without awaiting `final()`.

## 6. Message History Management

Correct continuation:

- After a successful `run()` or `generate()`, use the returned `messages` (or `result.messages`).
- Use the provided helpers:
  - `appendAssistant(messages, response)`
  - `toAssistantMessage(response)`
  - `toolExecutionToMessage({ toolCallId, toolName, result, isError })`

**Tool ID rule** (non-negotiable):
```ts
const toolCallId = call.callId ?? call.id;
```

Always use this when building tool result messages. Using the wrong ID breaks conversation continuity.

Message order must be: `user` → `assistant` (with tool calls) → `tool` results → next `user` or `assistant`.

## 7. Approvals

Tools can declare `requiresApproval: true`.

- When streaming, watch for the `approval_required` event.
- The rejection mode (`return_tool_error` or `abort_run`) controls what happens on user rejection.
- Never hardcode approval logic — respect the `rejectionMode`.

## 8. Common Pitfalls (You Must Avoid These)

1. **Wrong or missing `origin`** — Bridge rejects the request. Always include your dev server URL during development.
2. **Using `generate()` instead of `run()` when tools are present** — Tool execution never happens.
3. **Forgetting to provide `execute` on a tool** — SDK returns a tool error. The agent loop continues but the tool fails.
4. **Using incorrect tool call ID** (`call.id` instead of `call.callId ?? call.id`) — History becomes corrupted.
5. **Not awaiting `final()` or not consuming the full event stream** — You lose the final response and usage data.
6. **Not setting `maxIterations`** — Risk of infinite loops on stubborn agents (default is 10, but always set it explicitly).
7. **Hardcoding one model for all users** — Different users have different subscriptions. Let the user pick the model.
8. **Treating partial stream chunks as final state** — Always use `final()` or `run_complete`.
9. **Passing untrusted `command`/`args` to `mcpServers`** — Security risk. Validate everything.
10. **Not handling stream `error` events** — The agent appears stuck when the stream fails.
11. **Assuming the bridge is always running** — First call will fail if the user hasn't started `polarish bridge run`.
12. **Mixing local `tools` and `mcpServers` incorrectly** — Understand when to use each.
13. **Ignoring `requiresApproval` tools** — The run will hang waiting for approval that never comes in automated flows.

## 9. Error Recovery Playbook

When you encounter an error, follow this order:

**Bridge / Network errors** (`Fetch implementation is required`, connection refused, 4xx/5xx):
- Check that the user has run `polarish` at least once (first-run setup).
- Verify the bridge is running: `polarish bridge run` or check status.
- Confirm `baseUrl` matches the bridge.
- Check `origin` allowlist on the bridge side.

**Tool execution errors**:
- Verify the tool has a real `execute` function.
- Check that `inputSchema` parses the arguments correctly.
- Look at the error message returned in the tool result.
- Use `retrySafe: true` on idempotent tools.

**Streaming failures**:
- The `events` iterable will reject with the cause.
- Call `final()` — it will also reject.
- Log the error and surface it to the user.
- Do not retry the same stream object.

**Approval required but no UI**:
- Either implement approval UI or set `rejectionMode: "return_tool_error"` for automated flows.

**Infinite loop / too many iterations**:
- Always pass `maxIterations` (recommended: 5–15 depending on task complexity).
- Observe `run_turn_start` events to detect runaway behavior.

**Model not available**:
- The bridge returns a clear error. Tell the user to connect the provider via `polarish`.

## 10. What To Do When Stuck

1. **Verify bridge health** — Run `polarish status` and `polarish bridge run` if needed.
2. **Inspect the exact request** you are sending (log `provider`, `model`, `tools`, `mcpServers`).
3. **Check tool definitions** — Confirm every tool that should execute locally has `execute`.
4. **Review recent events** — Look at the last 3–5 events before the failure.
5. **Validate origins** — Ensure the exact origin string matches what the app is using.
6. **Test with `stream: false`** first — Easier to debug batch failures.
7. **Check provider availability** — Use `polarish` CLI to confirm Codex or Claude Code is installed and authenticated.
8. **Read the returned error body** on non-2xx responses — It usually contains the exact cause.

## 11. Supported Providers & Model IDs

**OpenAI Codex**:
- `gpt-5.2`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`

**Anthropic Claude Code**:
- `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`

Always let the end user choose the model. Do not hardcode.

## 12. Security & Reliability Rules

- Keep the bridge on localhost only.
- Never expose the bridge publicly.
- Validate all `mcpServers` commands.
- Respect `origin` allowlists.
- Always set `maxIterations`.
- Handle aborts and reconnects gracefully.
- Never persist partial stream state as final.
- Use `signal` (AbortSignal) for cancellation.
- Log at key points using the internal debug logger when debugging.

## 13. Best Practices for Agents

- Always create the client once and reuse it.
- Prefer `run({ stream: true })` for interactive experiences.
- Provide good `system` prompts and clear tool descriptions.
- Use `onTurn` (batch) or `run_turn_*` events (streaming) to observe progress.
- Continue conversations using the returned `messages` array.
- Set `temperature` and `maxRetries` explicitly.
- For long-running tasks, implement progress UI using the streaming events.
- When a tool fails, decide whether to retry, ask the user, or abort based on `retrySafe`.

## 14. Quick Checklist Before Every Request

- [ ] Client created with correct `baseUrl` and `origin`
- [ ] Bridge is running and healthy
- [ ] Correct method chosen (`generate` vs `run`)
- [ ] All tools have `execute` if local execution is expected
- [ ] `maxIterations` is set on `run()`
- [ ] Tool call IDs will use `call.callId ?? call.id`
- [ ] Stream errors and `final()` are handled
- [ ] Model ID is valid for the chosen provider
- [ ] Sensitive data is not leaked into logs or history

Follow these rules and you will produce reliable, secure, and maintainable AI workflows with Polarish.

---

**End of Skill Document**

This document is the single source of truth for any agent working with Polarish. Update it when the packages change.
