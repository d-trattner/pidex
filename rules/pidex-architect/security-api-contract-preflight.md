# Rule: Security + API Contract Preflight in Architecture Findings

PROC-NEW-60-1 | pidex-architect

## Trigger

Plan adds or changes user-facing API route, adapter contract, or degraded-response path.

## Rule

Before verdict, architecture findings MUST include explicit "Security + Contract Preflight" block:

1. Auth boundary check
   - Route auth requirement stated (required/optional/not-applicable).
   - Error body policy stated (no secret leakage, no internal topology leakage).
2. Contract check
   - Request schema, response schema, degraded metadata contract named.
   - Unknown external values mapped explicitly (`null` or enum fallback), never fabricated placeholder rows.
3. Verification binding
   - At least one scripted verification row for auth behavior.
   - At least one scripted verification row for degradation/partial-failure behavior.

If any item missing, verdict cannot be APPROVED; use APPROVED_WITH_CHANGES or REJECTED.

## Why

Plan 60 showed late security/contract gaps caused rework cycle and delayed handoff.
