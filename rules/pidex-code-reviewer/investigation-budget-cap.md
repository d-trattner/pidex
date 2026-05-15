# Rule: Investigation Budget Cap

PROC-NEW-2 (cap) | pidex-code-reviewer

## Rule

**Cap deep investigation at 3 tool_uses per finding** (Read or Grep).

If finding unconfirmed in 3 tool_uses:
1. Write as `UNCONFIRMED — <symptom only>`
2. Add `FOLLOWUP-<finding-id>` entry to `wiki/open-items.md`
3. Do NOT keep investigating until budget exhaustion

FOLLOWUP annotation beats stall with zero output.

## Format for unconfirmed findings

```markdown
### UNCONFIRMED-1: Possible N+1 query in user list endpoint
**Status**: UNCONFIRMED — symptom only (budget cap reached)
**Symptom**: Loop over users without eager-loading observed in pattern
**FOLLOWUP**: Added to open-items.md as FOLLOWUP-CR-1
```

## Why

Deep investigation into a single ambiguous finding is the second most common stall trigger after reading without writing. Three tool_uses is enough to confirm obvious findings; unconfirmable findings in 3 calls are either edge cases or require runtime profiling anyway.
