# Rule: Isolated Runs Are Insufficient for Timing-Fix QA Verification

**PROC-NEW:** 43c  
**Applies to:** pidex-qa  
**Trigger:** Plan being verified has a timing flake, race condition, or async assertion fix as its primary scope

## Rule

When verifying a timing-fix plan (race condition, `waitFor` wrapper, async state update, mock delay adjustment), QA MUST run the **full suite at least 4 consecutive times** before issuing a PASSED verdict.

Isolated test file runs (e.g., `vitest run src/components/NetworkPage.test.tsx`) are a permitted quick check but are **explicitly insufficient** to verify a timing fix. Isolated runs pass even when the full-suite parallel CPU load exposes a race.

## Why Isolated Runs Fail

Timing/flake bugs are **environment-sensitive**: they require CPU saturation (parallel test workers competing with wall-clock mock delays or async state transitions) to manifest. Isolated runs execute with exclusive CPU resources and shorter wall time, systematically hiding the race.

Example from Plan 43: 8 isolated runs + 1 full-suite run were all green for Revision 0. QA ran 4 consecutive full-suite runs and measured 50% flake rate. The bug was only visible under parallel load.

## Required Verification Protocol for Timing-Fix Plans

1. Run `npm run test:run` (or project's equivalent full-suite command, no file filters) 4 consecutive times.
2. All 4 runs must exit with 0 failures.
3. Document each run result in the QA doc (run 1/4: pass/fail, run 2/4: pass/fail, etc.).
4. Isolated runs may additionally be cited as supporting evidence but MUST NOT appear as the primary verification.

If any of the 4 full-suite runs fail: issue FAILED verdict with exact failure details and root cause analysis per the model handoff pattern (what assertion failed, DOM state observed, candidate root cause(s), ranked fix options).

## Rationale

Plan 43 (2026-04-27): QA correctly ran 4 full-suite runs (beyond the 1 the plan implied), which made the Revision 0 50% flake rate unambiguous. This was QA judgment, not a plan requirement. This rule encodes that judgment as a mandatory protocol so future QA agents apply the same rigor regardless of plan text.

## Scope

Applies when:
- The plan's objective includes "fix flaky test", "fix timing race", "wrap in `waitFor`", "fix async assertion"
- The plan changelog or known issue list references a pre-existing flake

Does NOT apply to:
- New feature plans with no timing/flake baseline
- Plans where the test changes are purely structural (rename, reorganize), not behavioral
