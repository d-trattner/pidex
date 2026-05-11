# Rule: Draft ROUTING After First Write

PROC-NEW-1 (enforcement detail) | pidex-implementer

## Rule

**Draft ROUTING immediately after first file write/edit.**

As soon as first substantive Edit or Write completes — no later — emit `<!-- ROUTING -->` block with `verdict: IN_PROGRESS`, best-guess `route_to`, doc path. Do NOT wait until "a good stopping point." First file write = trigger, no exceptions.

```html
<!-- ROUTING
verdict: IN_PROGRESS
route_to: pidex-code-reviewer
reason: Implementation in progress
context_file: agents.output/implementation/<id>-<slug>.md
-->
```

This guarantees routing signal even if agent is cut off mid-work.

## Why

Agents killed mid-tool-call (budget exhausted) never reach text output. Draft ROUTING as early as possible ensures orchestrator has a routing signal even on mid-turn budget cutoff.

See also: PROC-NEW-1 Output Discipline in agent .md for the full write-skeleton-first rule.

## Debugging Loop — Refresh ROUTING

**When stuck in a debugging loop, re-emit IN_PROGRESS ROUTING with the error text.**

Trigger condition: the same error message, exception type, or compiler diagnostic appears in
two or more consecutive Bash command outputs (same line reference, same error token, or same
failure message).

When triggered, emit:

```html
<!-- ROUTING
verdict: IN_PROGRESS
route_to: pidex-code-reviewer
reason: Debug loop — same error N occurrences: <paste exact error message here>. Last attempted fix: <one sentence>. Orchestrator: continuation spawn with error context may unblock.
context_file: agents.output/implementation/<id>-<slug>.md
-->
```

This refreshes the routing signal with actionable context. The orchestrator can then:
- Spawn a targeted continuation briefed with the exact error
- Diagnose the error independently (trivial-fix exception, Rule 10a)
- Escalate to the user if the error requires out-of-band knowledge

Without this refresh, the orchestrator sees only a generic IN_PROGRESS (from the initial
write-first emit) and must infer the error from incomplete bash output — increasing recovery time.

## Relationship to stall-recovery.md

`stall-recovery.md` (PROC-NEW-16) triggers at >75% maxTurns with `verdict: BLOCKED`.

This rule triggers earlier — when the same error repeats, regardless of budget — with
`verdict: IN_PROGRESS`. The two rules are complementary:
- Debug loop refresh: "I'm stuck, here is the error" (early warning, still running)
- Stall-recovery: "I'm out of budget, stopping here" (terminal signal)

## Empirical basis (debug loop)

Plan 40 (network-live-data-wiring, 2026-04-26): pidex-implementer entered a debug loop on a
block comment parse error. The turn budget was exhausted before the 75% stall-recovery
threshold triggered. The orchestrator had no error context in the ROUTING signal and had
to diagnose from incomplete bash output.
