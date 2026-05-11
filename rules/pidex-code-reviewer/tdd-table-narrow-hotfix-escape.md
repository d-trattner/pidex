# TDD Table Narrow Hotfix Escape

PROC-NEW: PIPELINE-ANALYST-1E

## Trigger

Code review of tiny test-only, type-only, or devops-blocker hotfixes with no production behavior change.

## Rule

A full TDD table is not required when all conditions are true:

- scope is narrow and explicitly identified as test-only/type-only/devops-blocker fix
- no production behavior changes
- implementation doc includes explicit N/A row
- validation command proving the fix is present

Allowed N/A row:

```md
| Test-only/devops-blocker hotfix | N/A | N/A | No production behavior changed; validation command proves fix | PASS |
```

or:

```md
N/A — test-only/devops-blocker fix; no production behavior changed; validation command proves fix.
```

## Reject when

- production logic changed
- user-visible behavior changed
- API behavior changed
- N/A is used to bypass missing tests for a real feature/fix
- no validation command is documented

## Why

Avoids wasteful re-loops for documentation-only TDD table misses on tiny hotfixes while preserving TDD discipline for product code.
