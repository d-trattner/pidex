---
ID: 4
Origin: agents.output/briefs/4-dashboard-parity-mobile-projects-g9-fix-brief.md
UUID: c222391b
Status: Rejected
---

# Code Review: Dashboard Parity Mobile Projects G9 Fix

## Plan Reference

- G9 fix brief: `agents.output/briefs/4-dashboard-parity-mobile-projects-g9-fix-brief.md`
- Original plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md` / ID `4` / UUID `5098e241`

## Implementation Reference

- `agents.output/implementation/4-dashboard-parity-mobile-projects-g9-fix.md`

## Date

2026-05-12

## Reviewer

pidex-code-reviewer agent

## TDD Compliance Check

| Check | Result | Evidence |
|---|---|---|
| TDD table present | PASS | Implementation doc has one row for Quality metrics mobile layout. |
| Test written first / failure verified / pass after impl | PASS | Table marks ✓ Yes all required columns. |
| Test quality | FAIL | Test checks regex presence, not CSS cascade/rendered rule result. Misses actual override. |

## Overview

G9 fix intent correct: add `quality-card`/`quality-metric-card` classes and desktop media restore. Actual CSS order breaks mobile requirement. `.glass-card { grid-column: span 4; }` appears after `.quality-card { grid-column: 1 / -1; }`, same specificity, later rule wins. Mobile Quality chart cards still span 4 of 12 columns.

## Files Reviewed

| File | Status | Notes |
|---|---|---|
| `dashboard/routes/quality.tsx` | Reviewed | Quality articles use `glass-card glass quality-card`; metric tiles use `glass-card glass quality-metric-card`. |
| `dashboard/app/styles/theme.css` | Reviewed | Cascade order causes mobile override failure. |
| `dashboard/tests/quality-mobile-layout.test.mjs` | Reviewed | Regex contract test passes despite broken cascade. |

## Findings

### Critical

None.

### Major

#### M1 — Mobile Quality full-row CSS overridden by later `.glass-card`

- File/line: `dashboard/app/styles/theme.css:120`, `dashboard/app/styles/theme.css:128`, `dashboard/app/styles/theme.css:169`
- Description: `.quality-card` and `.quality-metric-card` set `grid-column: 1 / -1`, but `.glass-card { grid-column: span 4; }` is declared later with same specificity. Since Quality markup includes both classes (`glass-card glass quality-card`), later `.glass-card` wins on mobile.
- Impact: G9 rejection remains unresolved. At mobile width, chart/cards can still render three-per-row instead of one chart/card per row.
- Recommendation: Move Quality overrides after base `.glass-card`, or increase specificity with `.glass-card.quality-card { grid-column: 1 / -1; }` and `.glass-card.quality-metric-card { grid-column: 1 / -1; }`, with desktop restore inside `@media (min-width: 900px)` using same specificity.

#### M2 — Regression test does not verify cascade or rendered mobile layout

- File/line: `dashboard/tests/quality-mobile-layout.test.mjs:6-9`
- Description: Test asserts class/rule text exists, but not that final cascade makes `quality-card` full-width on mobile. Broken CSS order still passes.
- Impact: Future regressions can pass validation while user-visible layout remains broken.
- Recommendation: Add cascade-aware assertion. Minimum: parse source order and assert final mobile `grid-column` winner for `.glass-card.quality-card`/`.quality-card` is full row. Better: browser/computed-style check at 375px for `/quality` article widths/rows.

### Minor

None.

## Positive Observations

- Fix is scoped to Quality layout and focused regression test.
- Desktop intent preserved via `@media (min-width: 900px)` rule shape.
- Typecheck passes.

## UI Pattern Parity Review

FAIL. Required mobile one chart/card per row not enforced due cascade. Desktop preserve intent not enough while G9 mobile criterion fails.

## Execution Profile Diff Guard

| Approved profile | Actual G9 diff class | Skips affected | Verdict |
|---|---|---|---|
| `ui-heavy`; security not skipped in original plan | Narrow UI CSS/route/test hotfix | No new API/security surface; QA still needed after fix | PASS for scope, FAIL for implementation result |

## Fallow Evidence

- Command: `cd dashboard && npx fallow audit --format json --quiet --explain 2>/dev/null || true`
- Outcome: PASS_WITH_FINDINGS / existing broad complexity debt.
- Review impact: Non-blocking for G9 fix. Finding includes existing `routes/quality.tsx` complexity, but G9 rejection caused by CSS cascade, not new complexity.

## Security Scope Assessment

Security review skipped for this G9 hotfix route. Criteria met:
- No new API routes/server actions/data mutations.
- No auth/authz touched.
- No new dependencies.
- No new user input paths.
- CSS/markup/test-only change.

## Validation Evidence

- `node dashboard/tests/quality-mobile-layout.test.mjs` ✅ (but insufficient; see M2)
- `cd dashboard && npm run typecheck` ✅
- CSS cascade review ❌ (`.glass-card` later overrides mobile full-row rules)
- Version check: `dashboard/package.json` version `0.1.0`; plan target release `TBD`. No version drift finding.

## Verdict

REJECTED

## Rationale

G9 acceptance criterion not met. Mobile full-row rule loses cascade to later `.glass-card` rule. Test evidence green but not behavior-equivalent.

## Next Action

Route to `pidex-implementer`. Fix CSS cascade and strengthen regression test. Then rerun focused test + typecheck.

<!-- ROUTING -->
verdict: REJECTED
route_to: pidex-implementer
context_file: agents.output/code-review/4-dashboard-parity-mobile-projects-g9-fix-code-review.md
gate: none
reason: Mobile Quality full-row CSS is overridden by later .glass-card rule; G9 fix not actually enforced.
<!-- /ROUTING -->
