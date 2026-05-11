# Rule: Deferred Scope Check Before Rejecting

PROC-NEW-13 | pidex-code-reviewer

## Rule

**Before raising REJECTED for missing feature/route, check plan's "Out of Scope" / "Deferred" section.**

If item explicitly deferred to future plan:
- Document as **observation only** — not a finding
- Do NOT reject for intentionally deferred items

Rejecting intentionally deferred items = false positive.

## Application

When about to raise a finding for "missing X":
1. Read plan's Out of Scope / Deferred section
2. If X is listed there: note as observation, do not reject
3. If X is NOT listed: raise finding normally

## Format for deferred observation

```markdown
### Observation: Pagination for audit log (DEFERRED — not a finding)
**Status**: OBSERVATION only
**Note**: Plan explicitly defers pagination to future plan. Not raised as finding.
```
