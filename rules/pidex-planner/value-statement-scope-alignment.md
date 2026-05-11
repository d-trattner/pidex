# Rule: Value Statement / Scope Table Alignment

PROC-NEW-35a | pidex-planner

## Rule

Before finalizing any plan, verify that every broad claim in the Value Statement is fully backed by the Scope table.

**Broad claim patterns to check:**

- "all X references" / "zero X remaining"
- "complete removal of Y"
- "no remaining Z"
- "fully cleaned up"
- "all instances of W"

For each such claim: the Scope table MUST enumerate every affected file/line, OR the Value Statement must be reworded to name only the specific items that are in scope.

**If full enumeration is infeasible:** reword the Value Statement to match the actual scope:

```
# Instead of:
"all stale /v2/ references cleaned up from the codebase"

# Write:
"stale /v2/ references in [file-a, file-b, file-c] cleaned up"
# or
"the /v2/ basepath string removed from config files and JSDoc in apps/web/src/..."
```

## When to apply

Any plan whose Value Statement contains "all", "zero", "none", "complete", "every", "no remaining", or equivalent comprehensive language.

## Why this matters

A Value Statement that claims comprehensive cleanup but omits instances creates a false "done" signal. UAT or a future audit will find the remaining instances. The critique agent is NOT the backstop for planner enumeration gaps — catching scope misalignment at planning time saves a critique-expand + second-implement cycle.

## Empirical basis

Plan 35 (post-migration-cleanup, 2026-04-25): Value Statement said "all stale `/v2/` references cleaned up" but initial Scope table covered 2 of 5+ references. pidex-critic expanded scope at F-1, which was accepted — but the misalignment was avoidable at planning time. The critique correctly caught it, but that requires an extra round-trip.
