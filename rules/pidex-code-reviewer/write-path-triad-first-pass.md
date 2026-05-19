# Write-Path Triad First-Pass Checklist

PROC-104-D-2

## Trigger

Apply on first-pass review of any plan that introduces or modifies write-path routes/actions/commands (state mutation or side-effecting operations).

## Rule

Reviewer must check and document all three triad items per write route before deeper review:

1. **Topology invariant** — route/action proves mutation is constrained to the declared scope (project/site/tenant/service) before write.
2. **Strict parse / fail-closed** — malformed payloads, missing schema fields, and boundary violations are rejected before mutation.
3. **Non-leak outward errors** — failure responses for authz/validation/provider/db errors are sanitized and do not expose internal state or topology.

## Required Review Output

Include an explicit checklist block (pass/fail reason per item) with artifact references (tests, code proofs, or logs).

## Reject rule

Missing any required triad item is a blocking finding unless a per-route documented skip explains why this route is not user-scope-write-path and `WRITE-PATH-TRIAD-SKIP` rationale is accepted.
