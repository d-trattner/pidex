---
ID: dashboard-mobile-design-limits-plan
Origin: dashboard-mobile-design-limits-brief
UUID: eec388ea
Status: Rejected
---

# Code Review: dashboard mobile design limits

## Plan reference

- Path: `/home/daniel/pidex/agents.output/planning/dashboard-mobile-design-limits-plan.md`
- ID: `dashboard-mobile-design-limits-plan`
- UUID: `eec388ea`

## Implementation reference

- Path: `/home/daniel/pidex/agents.output/implementation/dashboard-mobile-design-limits-implementation.md`

## Date

2026-05-12

## Reviewer

pidex-code-reviewer

## TDD Compliance Check

- Table present: yes.
- Rows complete: yes.
- Test-first/failure evidence: yes. Static contract tests recorded failure reasons and pass after implementation.
- Concern: tests assert source markers only. They do not catch focus transition bug below.

## Overview

Mobile trigger/table/limits implementation mostly matches design: shared nav remains root-mounted, full-width mobile button exists, sheet rows use active aria state, tables use horizontal containment, Limits falls back from `limits` to `records` without fake rows. Blocker found in mobile sheet focus-return implementation.

## Files Reviewed

| File | Status | Notes |
|---|---|---|
| `dashboard/components/navigation/global-nav.tsx` | Reviewed | Shared nav/sheet implementation. Blocker: initial autofocus. |
| `dashboard/app/styles/theme.css` | Reviewed | Full-width trigger, sheet animation, table-scroll styles. |
| `dashboard/routes/limits.tsx` | Reviewed | Real payload fallback, composite key, table scroll, wrapped controls. |
| `dashboard/routes/runs.tsx` | Reviewed | Table scroll wrapper present. |
| `dashboard/routes/tokens.tsx` | Reviewed | Table scroll wrappers present. |
| `dashboard/routes/pipelines.tsx` | Reviewed | Table scroll wrapper present. |
| `dashboard/routes/analysis.tsx` | Reviewed | Table scroll wrappers present. |
| `dashboard/routes/live.tsx` | Spot-checked | Existing inline horizontal overflow containers present. |
| `dashboard/routes/__root.tsx` | Reviewed | Shared header/menu mounted once. |
| `dashboard/tests/dashboard-copy-and-interactions.test.mjs` | Reviewed | Static contract tests added. |
| `dashboard/package.json` | Version check | Version `0.1.0`; no plan version drift found. |

## Findings

### Critical

None.

### Major

**MAJOR-1: Mobile menu trigger steals focus on initial page load**
- Location: `dashboard/components/navigation/global-nav.tsx:98-101`
- Description: Effect runs after first mount with `open === false`, then calls `triggerRef.current?.focus()`. Focus return should happen after sheet closes, not on initial page load.
- Impact: Keyboard/screen-reader users land on fixed bottom Menu button unexpectedly. Page header/content focus order regresses. Design accessibility contract not met.
- Recommendation: Track prior open state and focus trigger only on transition `open: true -> false`, or move focus return into explicit close handlers. Do not focus trigger on initial render.

### Minor

**MINOR-1: Live route still uses inline overflow style instead of shared `table-scroll`**
- Location: `dashboard/routes/live.tsx:278`, `323`, `366`, `409`, `450`
- Description: Live tables have horizontal containment via `overflowX: 'auto'`, but do not use shared class added for other routes.
- Impact: DRY/pattern consistency gap. Not blocking because live tables still have scroll containers and plan allowed replacing inline wrappers where practical.
- Recommendation: Later cleanup: wrap live tables with `<div className="table-scroll">` like other routes.

## Positive Observations

- Root routes and shared header/menu ownership preserved.
- Mobile trigger meets full-width/rect/safe-area intent in CSS.
- Mobile sheet rows are one-per-row with `aria-current="page"` active state.
- Limits data fix does not invent provider rows; it prefers real `limits` and falls back to real `records`.
- Composite Limits row key reduces duplicate-provider collisions.
- Static tests, typecheck, build pass.

## UI Pattern Parity Review

| Surface | Source pattern checked | Target files checked | Parity result | Findings |
|---|---|---|---|---|
| Bottom menu trigger | Plan + design mobile contract | `global-nav.tsx`, `theme.css` | Mostly pass | Full-width trigger present; focus bug in MAJOR-1. |
| Mobile sheet | Plan + design sheet contract | `global-nav.tsx`, `theme.css` | Partial | Rows/active/escape/trap present; focus return implemented too broadly. |
| Tables | Plan table scroll strategy | route table files + `theme.css` | Pass with comment | Dedicated wrappers on changed routes; live uses existing inline scroll. |
| Limits data display | Plan L1-L6 + design data expectation | `limits.tsx` | Pass | Real payload fallback only; no fake rows. |

## Execution Profile Diff Guard

| Approved profile | Actual diff class | Skips affected | Verdict |
|---|---|---|---|
| `ui-heavy` | UI/frontend TSX/CSS + static tests | Security not skipped in plan | Within profile; route security after fix. |

## Fallow Evidence

- Command: `npx fallow audit --format json --quiet --explain 2>/dev/null || true`
- Outcome: PASS_WITH_FINDINGS.
- Review impact: Non-blocking for this scope. Fallow reported existing broad complexity/duplication, including `global-nav.tsx:onKey` high CRAP and route complexity. Human blocker is MAJOR-1.

## Security Scope Assessment

- New API routes/server actions/data mutations: no in reviewed implementation.
- Auth/authz touched: no.
- New dependencies: no in implementation scope.
- User-supplied input processed in new code paths: Limits POST existing path only, unchanged by reviewed diff.
- CSS/style-only or pure tests: no; product TSX changed.
- Execution Profile/critic allows security skip: no. Plan explicitly keeps pidex-security.
- Result: security review required after code-review approval. Current verdict rejected, so route to implementer first.

## Validation Evidence

| Command | Result |
|---|---|
| `node --test tests/dashboard-copy-and-interactions.test.mjs` | PASS, 7/7 |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npx fallow audit --format json --quiet --explain 2>/dev/null || true` | Completed with findings |

## Verdict

REJECTED

## Rationale

Accessibility contract failure blocks. Fix small and localized. Other reviewed scope acceptable.

## Next Action

Return to pidex-implementer. Fix focus-return transition. Re-run `node --test tests/dashboard-copy-and-interactions.test.mjs`, `npm run typecheck`, `npm run build`.

<!-- ROUTING
verdict: REJECTED
route_to: pidex-implementer
reason: Mobile sheet focus-return effect autofocuses bottom Menu on initial page load; fix before security/QA.
context_file: /home/daniel/pidex/agents.output/review/dashboard-mobile-design-limits-code-review.md
-->
