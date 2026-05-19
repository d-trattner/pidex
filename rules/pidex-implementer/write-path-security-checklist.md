# Write-Path Security Checklist

PROC-104-D-1

## Trigger

Apply when implementing or changing write-path flows (mutations) in API routes, server actions, adapters, queue writers, or background jobs that create, update, delete, or enqueue project-scoped/user-scoped data.

## Rule

Before first code-review handoff, the implementation artifact MUST include a `Write-Path Security Checklist` and evidence for all items:

1. **Parse fail-closed** — invalid payloads, unexpected content-type, or schema violations return reject/validation errors and do not execute side effects.
2. **Topology invariant** — route/service path validates target namespace (project/site/tenant/service) before mutation; cross-namespace mismatch is rejected.
3. **Non-leak outward errors** — unauthorized, malformed, and provider/backend failures return messages that do not leak IDs, secrets, raw provider payloads, SQL, file paths, or internal topology.
4. **Rollback proof** — before first code-review handoff, show explicit rollback/compensation path for write path failure (transaction rollback, idempotency, or compensating write) and no partial-write side effects.

## Evidence Required

Before first code-review handoff, provide evidence links/assertions for each point above (tests, logs, or explicit proof).

## Reject if Missing

If the trigger applies and checklist/evidence is missing, apply blocking review gate unless implementation is demonstrably non-user/non-namespace-scoped and documented as `WRITE-PATH-SKIP`.
