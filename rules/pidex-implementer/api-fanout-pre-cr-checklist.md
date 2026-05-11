# API Fan-out Pre-CR Checklist

PROC-NEW: 71-1

## Trigger
Plan adds or modifies API fan-out/aggregate route calling multiple domains/services.

## Rule
Before first code-review handoff, implementer must run and document checklist in implementation doc:
1. Origin trust model explicit (same-origin or allowlist) and enforced.
2. Port derived dynamically from request origin/runtime config; no hardcoded `:80`/`:443`.
3. Upstream timeout bounded and documented.
4. KPI semantics truthful under partial/all-fail states.
5. Error payload sanitized (no internal host/token/path leaks).

If any item missing: do not route `COMPLETE`; fix first.

## Evidence
Implementation doc section `Fan-out Pre-CR Checklist` with PASS/FAIL per item + file/line refs.
