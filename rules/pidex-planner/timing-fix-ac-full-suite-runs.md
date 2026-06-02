# Rule: Timing-Fix Acceptance Criteria Must Mandate 4 Consecutive Full-Suite Runs

**PROC-NEW:** 43b  
**Applies to:** pidex-planner  
**Trigger:** Plan primary objective is fixing a timing flake, race condition, or async assertion failure

## Rule

For any plan whose primary scope is fixing a test timing race, flake, or async assertion failure, the acceptance criteria MUST include a full-suite multi-run requirement. The minimum bar is **4 consecutive full-suite runs with 0 failures**.

Add this AC row to the plan's Acceptance Criteria table:

> **AC-X: Full-Suite Parallel Flake Verification** — detected package-manager equivalent full-suite command such as `pnpm run test:run` or `npm run test:run` (without test-filter flags) passes on 4 consecutive runs with 0 failures. Isolated file runs are a useful quick check but do NOT substitute for this requirement. Full-suite parallel load is the canonical environment for validating timing fixes — a flake rate as high as 50% can be invisible in a single full-suite run and always invisible in isolated runs.

## Why 4 Runs

A single full-suite run at 50% flake rate has a 50% chance of passing by luck. Four consecutive runs bring the false-pass probability to (0.5)^4 = 6.25% — low enough to treat as validated. For lower flake rates the bar is proportionally easier to reach.

## Rationale

Plan 43 (2026-04-27): AC-2 required only 1 full-suite run (implied by "exits with 0 failures"). The implementer ran 8 isolated runs + 1 full-suite run — all green for Revision 0. QA ran 4 full-suite runs and found 50% flake rate. The plan's acceptance criteria did not constrain QA's required run count, which made the false-green implementer verification permissible under the plan's own text. A mandatory AC row closes this gap.

## Scope

Applies when the plan's primary goal is:
- Fixing a known flaky test (timing, race condition, async state)
- Wrapping assertions in `waitFor` to fix a flake
- Adjusting mock delays, timers, or async sequencing to eliminate a race

Does NOT apply to:
- Plans that add new tests (no existing flake baseline to validate)
- Plans that incidentally touch test files as part of a feature change
