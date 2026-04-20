# Polarish Plan

## Purpose

Polarish exists to let developers build AI-powered products without paying to host inference themselves. The user brings an existing AI subscription and Polarish routes requests through the local bridge on that user's machine.

This plan is written as the long-form execution roadmap for the repository at `/Users/harshithpasupuleti/code/hax`. It covers the current architecture, the near-term product goals, the engineering priorities, and the release sequence that keeps the system correct under streaming, local bridge restarts, and provider differences.

---

## 1. Product Vision

Polarish should become a reliable local AI runtime layer that makes existing subscriptions usable inside third-party apps.

The product must do four things well:

1. Let end users install one CLI and expose a local bridge.
2. Let application developers consume a small, predictable TypeScript SDK.
3. Preserve correct behavior across providers, streaming modes, tools, and retries.
4. Make setup and debugging simple enough that users can self-serve without support overhead.

The core product promise is:

> Use your existing Codex or Claude Code subscription locally, from your own app, with as little friction as possible.

---

## 2. Current Repository Shape

The repo is a monorepo managed with Bun and Turbo.

### Root-level responsibilities

- `README.md` communicates the product story and basic usage.
- `package.json` defines the workspace, task scripts, and shared dev tooling.
- `turbo.json` coordinates build, lint, and typecheck workflows.

### Packages

- `packages/hax-cli`
  - Provides the CLI entrypoint.
  - Hosts the local bridge HTTP server under `src/bridge/`.
  - Handles login, logout, origin allowlisting, status, and provider connection flows.

- `packages/ai`
  - Provides the TypeScript SDK used by browser and app code.
  - Exposes `create`, `generate`, `run`, request compilation, unified stream consumption, and history helpers.
  - Encodes the provider-agnostic request/response contract.

- `apps/playground`
  - Provides a manual test surface for local development.
  - Lets the team validate the SDK and bridge together before release.

### Current technical emphasis

- Local-first runtime behavior.
- Unified provider abstractions.
- Streaming response handling.
- Tool execution loop correctness.
- Predictable request/response mapping.

---

## 3. Design Principles

These are the rules that should guide every change.

### Correctness first

- Favor behavior that is correct under retries, reconnects, and partial streams.
- Never trade away protocol clarity for convenience in request mapping.
- Keep tool-call correlation explicit and deterministic.

### Local bridge reliability

- The CLI bridge is an always-on local dependency for browser apps.
- Startup, health, and reconnection paths must be boring and observable.
- Errors should fail closed rather than leaking ambiguous partial state.

### SDK simplicity

- The SDK should expose the smallest useful surface area.
- The public API should encourage the right pattern by default.
- Manual handling should exist only where it adds control, not where it hides complexity.

### Provider isolation

- Codex and Claude Code are different runtimes and may evolve independently.
- Provider-specific quirks should live behind adapters and compilation layers.
- Shared behavior should be centralized in common request, stream, and history helpers.

### Maintainability

- Shared logic should be extracted when duplicated across modules.
- Types should describe the contract clearly enough that consumers do not need to inspect internals.
- Tests should cover the behavior that is hard to reason about from the API surface alone.

---

## 4. Immediate Engineering Goals

The next set of work should focus on making the system easier to trust and easier to extend.

### Goal A: Make the bridge predictable

The CLI bridge should behave like a stable local service, not a best-effort helper.

Key outcomes:

- Deterministic startup and shutdown behavior.
- Clear health and status reporting.
- Explicit origin authorization.
- Reconnect-safe session handling.
- Straightforward error messages when the provider runtime is unavailable.

### Goal B: Make the SDK hard to misuse

The SDK should steer consumers toward safe patterns.

Key outcomes:

- `run()` remains the primary path for tool-using workflows.
- Streaming event handling stays consistent across batch and live modes.
- History continuation is handled through returned messages rather than user-managed reconstruction.
- Provider request compilation stays testable and well-documented.

### Goal C: Improve validation coverage

The codebase should protect itself against subtle regressions.

Key outcomes:

- Unit tests for request compilation, stream consumption, and history conversion.
- End-to-end tests for real bridge interactions where practical.
- Regression tests for previously discovered protocol edge cases.

### Goal D: Make onboarding simpler

The product should explain itself better.

Key outcomes:

- README and package docs that match the actual behavior.
- Setup steps that clearly distinguish CLI installation from runtime prerequisites.
- Troubleshooting guidance for common local environment failures.

---

## 5. Execution Plan

## Phase 1: Stabilize the Core Contract

This phase focuses on the foundation that everything else depends on.

### 5.1 Define the canonical request/response contract

Deliverables:

- A single authoritative request shape for SDK consumers.
- Stable mapping from SDK request fields to provider-native payloads.
- Explicit handling for:
  - messages
  - tool definitions
  - tool results
  - model selection
  - system prompts
  - streaming mode
  - retries

Acceptance criteria:

- Request compilation logic is centralized.
- Each provider adapter maps the same logical request consistently.
- Tests cover the main request permutations.

### 5.2 Normalize unified stream processing

Deliverables:

- A robust unified stream parser/consumer.
- Clear event types for:
  - text deltas
  - tool call deltas
  - tool result events
  - final completion
  - error states

Acceptance criteria:

- Partial events do not get mistaken for final state.
- Streaming and batch paths converge on the same final response shape.
- The consumer can recover cleanly from malformed or truncated events.

### 5.3 Formalize history conversion

Deliverables:

- Reliable conversion from unified responses back into conversation history.
- A history format that preserves the semantic structure of tool-calling turns.

Acceptance criteria:

- Continuing a conversation with returned history works without manual reconstruction.
- Assistant/tool/user ordering remains correct.
- Tests cover round-trip behavior.

---

## Phase 2: Harden the Local Bridge

This phase makes the CLI and server safe to run in daily use.

### 5.4 Strengthen CLI lifecycle management

Deliverables:

- Safe startup/shutdown orchestration.
- Process-level status reporting.
- Clear lifecycle commands for login/logout/status/bridge run.

Acceptance criteria:

- A user can tell whether the bridge is running and usable.
- The CLI handles missing dependencies with actionable errors.
- Restart behavior does not corrupt local state.

### 5.5 Tighten origin security

Deliverables:

- Origin allowlisting behavior that is explicit and inspectable.
- Validation paths for adding/removing/listing origins.
- Guardrails against accepting traffic from unexpected origins.

Acceptance criteria:

- Only allowed origins can use the bridge.
- Origin changes are reflected immediately and consistently.
- Status output makes the active origin policy easy to understand.

### 5.6 Improve provider runtime bridging

Deliverables:

- Clear adapter boundaries between the bridge and provider-specific runtimes.
- Consistent error translation for local and remote failures.
- Session continuity handling that survives transient interruptions.

Acceptance criteria:

- Codex and Claude Code adapters expose the same logical capabilities where possible.
- Provider-specific failures do not leak unstable internal details into the SDK contract.
- Reconnection and stream resumption behavior is well-defined.

---

## Phase 3: Make the SDK Production-Grade

This phase focuses on the browser/app-facing package.

### 5.7 Refine `generate()`

Deliverables:

- Strong request validation.
- Clear separation between batch and streaming behavior.
- Stable response shape for consumers.

Acceptance criteria:

- Single-turn non-tool workflows are straightforward.
- Streaming callers can consume live output without needing to understand bridge internals.
- Failures are reported in a way that is actionable for application developers.

### 5.8 Refine `run()`

Deliverables:

- Fully managed tool loop behavior.
- Correct handling of tool execution, missing executors, and error returns.
- Explicit iteration limits and abort behavior.

Acceptance criteria:

- Consumers do not need to hand-roll tool loops.
- Tool-call correlation stays correct across turns.
- The final result includes all required history for continuation.

### 5.9 Document the integration model

Deliverables:

- A concise integration guide for app developers.
- Examples for both server-side and browser-side usage.
- Clear explanation of the local bridge dependency.

Acceptance criteria:

- A new developer can understand the architecture from the docs alone.
- The docs distinguish developer setup from end-user setup.
- Examples match the current public API.

---

## Phase 4: Expand Testing and Verification

This phase reduces the probability of shipping regressions.

### 5.10 Add deeper unit coverage

Focus areas:

- Provider request compilation.
- Unified stream decoding.
- History conversion.
- Error normalization.
- Bridge contract behavior.

Acceptance criteria:

- Each non-trivial adapter path has direct tests.
- Edge cases around missing fields and partial payloads are covered.

### 5.11 Add end-to-end validation

Focus areas:

- CLI startup and status checks.
- Origin allowlist behavior.
- SDK request through bridge to provider and back.

Acceptance criteria:

- The main user journey is exercised end to end.
- Failures are reproducible and tied to concrete test cases.

### 5.12 Add regression tests for failure modes

Focus areas:

- Interrupted streams.
- Tool-call retries.
- Session restarts.
- Invalid tool definitions.
- Malformed provider responses.

Acceptance criteria:

- Reproducing a known bug should require only one dedicated test.
- Fixes are accompanied by the test that would have caught them.

---

## Phase 5: Improve Developer Experience

This phase is about reducing setup friction and support burden.

### 5.13 Make the playground more useful

Deliverables:

- A reproducible local harness for testing request shapes and stream behavior.
- UI controls that expose the important bridge and SDK settings.
- Visual feedback for request lifecycle and errors.

Acceptance criteria:

- Developers can validate integration changes without publishing anything.
- The playground reflects the true API contract.

### 5.14 Improve diagnostics

Deliverables:

- Logs that show lifecycle, request routing, provider selection, and error context.
- Status output that helps distinguish configuration issues from runtime failures.
- Minimal but effective debug surfaces.

Acceptance criteria:

- When something breaks, the first failure is understandable.
- Users do not need source-code inspection to identify setup mistakes.

### 5.15 Tighten package documentation

Deliverables:

- README updates that match the shipping behavior.
- Inline JSDoc on new public types and functions.
- A clearer separation between internal modules and public APIs.

Acceptance criteria:

- Public-facing behavior is documented close to the code.
- New contributors can navigate the repo without guessing intent.

---

## 6. Release Strategy

The repository should ship in small, verifiable steps.

### Release ordering

1. Lock down protocol and adapter behavior.
2. Stabilize CLI bridge lifecycle and status paths.
3. Harden SDK streaming and tool-loop semantics.
4. Expand automated tests.
5. Improve onboarding and playground tooling.

### Release criteria

A release is acceptable only if:

- Typecheck passes across the workspace.
- Lint passes across edited packages.
- The highest-risk request/stream flows are covered by tests.
- User-facing docs reflect the shipped behavior.
- No change regresses origin security or local bridge stability.

---

## 7. Quality Bar

Every change should satisfy these checks.

### Correctness

- Does the change preserve message ordering?
- Does it preserve tool-call correlation?
- Does it behave sensibly when the provider returns partial or malformed data?

### Reliability

- Does it keep working after process restart?
- Does it fail safely when the provider is unavailable?
- Does it avoid leaking inconsistent intermediate state?

### Maintainability

- Is shared logic factored into a single place?
- Are types and names clear enough to prevent misuse?
- Is the behavior covered by tests rather than comments alone?

### Developer ergonomics

- Is the happy path the easiest path?
- Are errors actionable?
- Is the API surface small and consistent?

---

## 8. Suggested Workstreams

If this repository is being actively developed, work should be organized into these streams.

### Workstream A: Bridge runtime

- CLI lifecycle.
- Local server stability.
- Origin validation.
- Provider adapter integration.

### Workstream B: SDK behavior

- `generate()` and `run()`.
- Unified response parsing.
- History continuation.
- Public API cleanup.

### Workstream C: Testing

- Unit tests.
- Integration tests.
- End-to-end smoke tests.
- Regression tests for known edge cases.

### Workstream D: Documentation and onboarding

- Root README.
- Package READMEs.
- Setup instructions.
- Troubleshooting guidance.

### Workstream E: Playground and demos

- Local UI for validating flows.
- Realistic examples.
- Diagnostics and visibility.

---

## 9. Risks And Constraints

### Risk: Provider drift

Codex and Claude Code may change response shapes, streaming events, or operational assumptions. The adapter layer must absorb these changes without forcing app-level rewrites.

### Risk: Local environment fragility

Because the runtime depends on a local CLI and installed provider tools, setup problems will appear as product bugs unless the diagnostics are strong.

### Risk: Streaming complexity

Partial output is easy to mis-handle. The code must be explicit about what is live data and what is final data.

### Risk: Tool-loop misuse

Consumers can easily implement tool loops incorrectly if the public API does not steer them toward `run()`.

### Risk: Docs drift

If the README and package docs lag behind the code, onboarding cost increases quickly and support burden grows.

---

## 10. Definition Of Done For Major Changes

A major change is done when all of the following are true:

- The implementation is complete in the intended package or packages.
- Shared logic is extracted where duplication would otherwise spread.
- Public types and functions have simple JSDoc where new surface area was added.
- Relevant tests were added or updated.
- Typecheck and lint are green for the touched workspace packages.
- Documentation reflects the new behavior.
- The change does not weaken origin security, tool-loop correctness, or streaming reliability.

---

## 11. Near-Term Action Checklist

If the goal is to move the repository forward immediately, the best next sequence is:

1. Audit the public SDK surface in `packages/ai` and ensure the docs match the real behavior.
2. Review the bridge lifecycle and origin security paths in `packages/hax-cli`.
3. Expand tests around stream parsing, history conversion, and request compilation.
4. Update the playground so it exercises the most important flows end to end.
5. Refresh the root README and package READMEs after the implementation details settle.

---

## 12. Long-Term Outcome

The end state for this repo is a clean split between:

- a trusted local CLI bridge that exposes provider runtimes safely,
- a small, explicit SDK that app developers can integrate without studying internals,
- and a test suite plus docs set that make future changes low-risk.

When that is in place, Polarish can evolve by adding providers, improving observability, and smoothing onboarding without changing the core integration model.

