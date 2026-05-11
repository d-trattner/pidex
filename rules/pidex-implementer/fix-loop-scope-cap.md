# Rule: Fix Loop Scope Cap

PROC-NEW-14 | pidex-implementer

## Rule

**More than 3 findings from pidex-code-reviewer? Address at most 3 per fix spawn.**

When receiving a REJECTED verdict from pidex-code-reviewer with more than 3 findings, address only the 3 highest-priority findings in the current spawn. Emit ROUTING requesting a second fix spawn for remaining findings.

## Why

Empirical data: 2–3 items complete in 24–28 tool_uses (safe within budget). Wider scopes risk hitting the ~40 tool_use budget wall mid-fix, leaving partial work uncommitted — worse than clean partial fix.

## Application

On backward handoff from pidex-code-reviewer REJECTED:
1. Count total findings
2. If > 3: select top 3 by severity, note remaining in impl doc
3. Fix surgically — not from scratch
4. Re-run tests, update impl doc with revision entry
5. Emit ROUTING with note that remaining N findings need second spawn
