# Rule: RED Phase Commit Checkpoint

PROC-NEW-45c | pidex-implementer

## Rule

When a TDD slice requires creating a **new test file** (not adding tests to an
existing file), commit the test file immediately after confirming RED (tests failing)
— before writing any GREEN implementation code.

**Commit message pattern:**
```
chore: S<N> RED phase — <slug> tests (failing)
```

Example:
```
chore: S0 RED phase — audit-item-pipeline tests (failing)
```

## Trigger

ALL of the following must be true:
1. Current TDD slice creates a new test file (not extends existing)
2. RED phase is confirmed (test run executed, failure output observed)
3. No GREEN implementation code has been written yet

## Steps

1. `git add <new-test-file>`
2. `git commit -m "chore: S<N> RED phase — <slug> tests (failing)"`
3. Proceed to GREEN implementation

## Why this matters

If the spawn is interrupted between RED and GREEN (rate limit, timeout, budget
exhaustion, kill signal), the committed test file gives the recovery spawn an
unambiguous git anchor:
- `git log --oneline -3` shows the RED commit
- Recovery spawn prompt: "S<N> RED committed at <hash>. Write GREEN implementation
  for the failing tests. Do not modify test file."

Without the commit, recovery requires orchestrator-provided state context ("test
file exists at path X, it's failing for reasons Y"). With the commit, the git
log is the state context.

## Interaction with existing rules

This rule is additive to `stall-recovery.md` (PROC-NEW-16) and
`impl-doc-before-final-tests.md` (PROC-NEW-35c). Those rules govern budget
pressure scenarios. This rule governs external-interruption resilience at the
RED/GREEN boundary.

Different triggers:
- `stall-recovery.md` triggers at >75% maxTurns (budget pressure)
- `impl-doc-before-final-tests.md` triggers at >65% maxTurns (budget pressure)
- This rule triggers at the RED/GREEN boundary when a new test file is created (always)

The RED commit does NOT count as a slice-completion commit. The slice-completion
commit (GREEN + refactor + impl doc entry) still happens at slice end as normal.

## Anti-pattern

Test file created, RED confirmed mentally ("I can see it will fail"), then
immediately proceed to write GREEN — no commit. If interrupted after creating
the test file but before writing GREEN, recovery spawn must reconstruct state
from context.

## Empirical basis

Plan 45 (audit-to-issue-pipeline, 2026-04-27): Spawn A stalled after creating
audit-item-pipeline.test.ts and confirming RED, but before writing GREEN
implementation. Rate limit hit. Recovery spawn required orchestrator context
brief: "test file exists, RED phase complete, implement GREEN." If the RED
commit had been made, `git log` would have been sufficient for the recovery
spawn to orient itself — no orchestrator context needed.
