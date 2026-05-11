# Structural Evidence First-Pass Review

PROC-NEW-026-2

## Trigger

Apply when reviewing structural pipeline/orchestration work, especially changes involving:

- pipeline runs/stages/transitions/attempts;
- provider execution or artifact contracts;
- `ROUTING` / `context_file` parsing or validation;
- status transitions (`running`, `failed`, `blocked`, `approved`, etc.);
- state-mutating API routes.

## Rule

On first review pass, verify that the implementation includes evidence for every structural invariant introduced or changed by the plan/architecture.

Minimum evidence checklist:

1. **Terminal state coherence** — failed/blocked terminal paths update all relevant persisted state, not only the happy-path caller.
2. **Artifact contract proof** — valid artifact passes; missing/invalid/provenance-failing artifact blocks or fails as designed.
3. **Route/authz proof** — mutation routes include session and resource ownership checks, with real helper coverage where SQL/schema logic exists.
4. **Response contract proof** — route response fields required by UI/callers are asserted in tests.
5. **No deferred handoff creep** — next-stage execution deferred by epic remains unexecuted.
6. **Cwd/path stability** — filesystem artifact checks are stable from supported workspaces/cwds when tests or tooling run there.

## Review Outcome

Reject when a structural invariant is implemented but only documented, mocked, or indirectly implied without executable evidence.

Downgrade to comment only when:

- the missing evidence concerns a non-critical edge case;
- the risk is tracked in open-items; and
- the primary value path and security boundary are covered.

## Reporting

Add a `Structural Evidence First-Pass` section to the code-review artifact with PASS/FAIL/SKIPPED rows. Use `SKIPPED` only with a one-line reason.
