---
name: local bridge shift
overview: Keep plan small and evidence-based while we explore migration from cloud machine auth/proxy to localhost bridge execution. Capture only current goal and fields/flows the code clearly shows we should drop or remove.
todos: []
isProject: false
---

# Local Bridge Shift

## What We Are Trying To Do

Move from cloud machine inference and stored third-party OAuth toward local vendor-auth execution.
Keep unified request/response contract for developers.
Make `packages/ai` client talk to localhost bridge instead of backend machine API.
Let official vendor tools handle auth on user device.

## Current Findings: Drop Or Remove

Remove cloud-proxy auth fields from `packages/ai` client factory:

- `accessToken`
- `refreshToken`
- `clientId`
- `clientSecret`
- `onSessionTokens`

Changes we'd make from current findings:

- drop `clientId`, `clientSecret`, `accessToken`, and `refreshToken` from `CreateClientOptions`
- drop `onSessionTokens`

Remove token refresh machinery tied to cloud OAuth:

- refresh-on-401 flow in `packages/ai/client/create.ts`
- `packages/ai/client/refresh-access-token.ts`
- tests that assert bearer auth and token refresh behavior
- drop all refresh-on-401 logic from `create()`
- drop auth docs/tests around bearer tokens and refresh flow

Remove token rotation from unified response shape:

- `SessionTokens`
- `UnifiedResponse.sessionTokens`
- stream handling that applies rotated tokens on `done` or `final()`
- drop `SessionTokens` type entirely
- drop `response.sessionTokens` from `UnifiedResponse`

Remove machine-centric wording and assumptions where found:

- machine endpoint naming
- machine stream wording in docs/comments/tests
- default cloud base URL assumption

## Keep For Now

Keep unified inference payload concepts unless later exploration says otherwise:

- `provider`
- `model`
- `system`
- `messages`
- `tools`
- `stream`
- `temperature`
- `signal`
- `maxRetries`
- unified response content/tool-call/usage/event shapes

## Service Model

Use always-on localhost bridge as default architecture.
User should not need to manually start bridge for normal use.
User installs CLI once, then OS keeps bridge running in background.
Bridge should restart after crash or after OS restart/login through OS service registration.
Need support for macOS, Linux, and Windows.

CLI is still useful, but mainly for setup and support:

- install/register background service
- status
- logs
- doctor
- restart
- uninstall

Bridge owns runtime behavior:

- accept localhost requests
- keep stable port/API available
- route requests to local provider harnesses
- stream responses back to apps

Bridge runtime decisions locked so far:

- use official local provider tools to detect auth state when possible
- for Codex install detection, use `codex --version`
- for Codex auth state, use commands like `codex login status`
- bridge does not store vendor OAuth tokens or app chat sessions
- bridge stays mostly stateless at conversation level
- tool execution stays outside bridge and is handled by application client or backend
- package keeps model and provider abstractions; bridge should reuse that instead of redefining them
- transport remains developer-selectable; default `sse`, also support `websocket`
- one user action may produce multiple provider requests through app-side orchestration; this does not require bridge-owned session state
- bridge may keep only request-scoped in-memory state while a run is active
- adapter selection comes directly from unified request `provider`
- adapter does not need separate model-availability check in v1
- adapter main jobs are runtime contact plus reuse of existing package mapping/compilation logic

Codex adapter/runtime decisions locked so far:

- use `codex app-server` as the local Codex runtime
- talk to Codex with JSON-RPC over stdio
- use request-scoped Codex child process/session in v1
- start fresh Codex app-server for each bridge request
- close the Codex child process when that request/run completes
- do not add bridge-owned long-lived provider session storage in v1
- reuse existing Codex request/response/stream mapping from `packages/ai`

## Bridge API Surface

Keep public bridge API surface small:

- `POST /v1/generate`

Endpoint behavior locked so far:

- `POST /v1/generate` is the only public generation endpoint
- request body keeps unified `stream` boolean
- `stream: false` returns normal JSON `UnifiedResponse`
- `stream: true` returns streaming response
- do not create separate public endpoint only for `stream: true`
- developer config should use one bridge `baseUrl`
- transport choice should be handled by SDK/client config, not by forcing developers to switch generation URLs
- do not ship `websocket` support on day 1
- ship `sse` first for launch

## Local Security Model

Use origin allowlist in local bridge config.
Allowlist is managed through CLI commands to add or remove origins/endpoints.
Do not allow arbitrary browser origins by default.
Store allowlist in OS-specific local config directory.

Security rules locked so far:

- allow all localhost origins
- allow public origins only when they are explicitly listed in config
- reject unknown public origins
- use `Origin` checks only for launch

## Local Config Shape

Keep config small but extensible.
Use nested config shape with at least:

- `server`
- `security`

Current config fields locked so far:

- `server.port`
- `security.allowedOrigins`

## Error Handling

Do not use `effect` in bridge or CLI error handling.
Use plain typed error objects or `neverthrow`.
Keep error contract lightweight for launch speed.
Error responses should be actionable for both developers and agents.
Do not return vague messages when bridge can provide useful context.
Need map every meaningful failure point to a clear typed error with enough detail to self-resolve.
Use provider-specific error codes when failure is provider-specific, for example `codex_not_installed`.

Error payload shape locked so far:

- required: `error.code`
- required: `error.message`
- optional: `error.detail`
- optional: `error.suggestedAction`
- optional: `error.metadata`

## T3 Code Reference

Use T3 Code as reference for local client -> local backend -> provider runtime separation.
Do not copy T3 Code startup model as-is.

T3 Code current shape:

- desktop app or CLI starts backend explicitly
- backend is session-scoped, not OS-managed service
- no always-on bridge across OS restarts

What we should do differently:

- bridge should be OS-managed background service
- bridge should auto-start on login/boot
- bridge should auto-restart on crash
- browser app should not depend on user running CLI each sessio

