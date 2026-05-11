# Rule: Write Impl Doc Summary Before Final Test Run When Budget Is Constrained

PROC-NEW-35c | pidex-implementer

## Rule

When approaching **> 65% of maxTurns** and the remaining work is: (a) run final test suite, (b) commit, (c) write impl doc — **reorder to: (b) commit what's done, (c) write impl doc summary, then (a) run final tests.**

The impl doc is the handoff artifact for every downstream agent. A missing impl doc forces a second spawn and orchestrator intervention. A test run that gets cut off mid-output is recoverable (re-run next spawn). An unwritten impl doc is not.

## Recommended order at > 65% budget:

1. `git add` + `git commit` (checkpoint current state)
2. Write impl doc — at minimum: Slice Table with current status, Handoff Notes, What Was Done
3. Emit draft ROUTING with `verdict: IN_PROGRESS`
4. Run remaining tests if budget allows
5. Update impl doc with test results
6. Emit final ROUTING

## Why this matters

The typical budget kill sequence for short plans (~12 tool-calls):
```
edit → edit → edit → test → test → git add → git commit → [budget exhausted]
```
The commit succeeds but the impl doc is never written. The next spawn sees a committed state but no impl doc, requiring orchestrator triage before pidex-code-reviewer can run.

The alternative sequence:
```
edit → edit → edit → git commit → write impl doc → [test if budget remains]
```
If cut off after step 4, the impl doc exists — downstream agents can proceed. Test results are missing but the committed code can be re-tested in a fresh spawn with a single Bash call.

## Interaction with existing rules

This rule is additive to `stall-recovery.md` (PROC-NEW-16). That rule governs the >75% threshold (stop, commit, emit ROUTING). This rule governs the 65-75% window where the agent can still complete — but must reorder to protect the impl doc.

The Rule 9b pre-created skeleton means an Edit to fill the impl doc is cheaper than a full Write. When a skeleton exists, filling it at the 65% threshold costs ~3 tool-calls (Edit × 3 sections). Worth it.

## Empirical basis

Plan 35 (post-migration-cleanup, 2026-04-25): pidex-implementer completed all edits, ran tests, committed — then stalled before writing the impl doc. A second invocation was required solely to write the impl doc. The work was complete; only the handoff artifact was missing. Reordering doc-before-final-tests would have captured the impl doc in the first spawn.
