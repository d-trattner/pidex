# Rule: Idempotency Tests Required for State-Mutating API Endpoints

PROC-NEW-60-2 | pidex-implementer

## Trigger

Spawn adds or changes POST/PUT/PATCH/DELETE endpoint that writes state (file, DB, queue, cache, or external service).

## Rule

Implementer MUST add idempotency coverage in same slice as endpoint behavior:

1. Repeat-call test
   - Send same mutation request twice.
   - Assert final persisted state matches single-apply intent (no duplicate side effects unless contract says append-only).
2. Response-contract test
   - Assert second-call response matches documented contract (same success shape, or explicit conflict/no-op status).
3. Scope rule
   - No handoff to code review without these tests green.

Document rows in impl doc TDD Compliance table for idempotency tests.

## Why

Plan 60 exposed missing idempotency test on `/updates`, leaving critical behavior unverified.
