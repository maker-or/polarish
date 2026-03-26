# Deal In Further

Reminder for later verification once the missing pieces are implemented and the full flow can be tested end to end.

## Open concerns

- Verify assistant message decoding against the real upstream response shape. The current schema compiles, but we still need to confirm that the incoming payload actually matches the expected field names and structure before treating it as correct.
- Fix API key parsing so verification does not break when a key contains extra underscores. The current split-by-underscore approach can fail for randomly generated keys that include additional underscores, so the parsing logic needs to handle that edge case safely.

## Follow-up

- Re-run schema validation after the assistant message path is wired up.
- Rework key extraction logic, then test it with keys that include one underscore and multiple underscores.

---

## Console client secrets UI (local-only for now)

`client-secrets-section.tsx` generates a **random hex string in the browser** (`randomHex`) and keeps rows in React state only — **not** WorkOS, **not** Convex. For real OAuth secrets, wire **`createClientSecret` / `listClientSecrets` / `revokeClientSecret`** from `convex/console.ts` back into that component and remove or replace the local `randomHex` flow.
