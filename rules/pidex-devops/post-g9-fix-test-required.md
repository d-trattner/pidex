# Rule: Post-G9-Approve Fix Commits Require Targeted Test Run

PROC-NEW-44d | pidex-devops

## Rule

If the orchestrator briefing indicates that code changes were made after G9 approval — i.e.,
a post-G9 fix commit exists — pidex-devops Stage 1 must NOT proceed until a targeted test run
on the affected component(s) is confirmed.

Required confirmation in briefing or impl doc:
  "Targeted test run on [ComponentName / route]: N tests, 0 failures."

If no targeted test run is documented: emit BLOCKED verdict and request it from the orchestrator
before proceeding to Stage 1.

## Scope calibration

- "Targeted run" = the test file(s) for the affected component or route — not the full suite.
- A full QA re-run is NOT required for a surgical fix (1-3 files changed, no logic-layer change).
- Zero test validation IS NOT acceptable for any post-G9 production code change.

## Normal pipeline flow

When no post-G9 code change exists: this rule does not apply. Proceed to Stage 1 as normal.

## Why this matters

The pipeline assumes G9-approved code is clean for Stage 1. When a post-G9 fix is applied
without a targeted test run, untested production code reaches the Stage 1 commit. Even a
3-edit surgical fix can introduce regressions if the affected component has test coverage.

## Empirical basis

Plan 44 (network-items-storage, 2026-04-27): count badge fix committed as f8ae1b3 (3 targeted
edits to SubmenuPanel) after G9 approval without an intermediate targeted test run. Fix was
correct, but the gap in protocol was identified in retrospective.
