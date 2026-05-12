---
ID: dashboard-mobile-design-limits-plan
Origin: dashboard-mobile-design-limits-brief
UUID: eec388ea
Status: Approved
---

# Code Review After QA: dashboard-mobile-design-limits

## TDD Compliance Check

Implementation doc has complete TDD table for hotfix rows:

| Function/Class | Test file | Written first | Failure verified | Pass after impl | Result |
|---|---|---:|---:|---:|---|
| pipelines render coercion guard | `tests/dashboard-copy-and-interactions.test.mjs` | ✓ | ✓ | ✓ | PASS |
| pipelines row key guard | `tests/dashboard-copy-and-interactions.test.mjs` | ✓ | ✓ | ✓ | PASS |
| pipelines endpoint hotfix | `tests/dashboard-copy-and-interactions.test.mjs` | ✓ | ✓ | ✓ | PASS |

## Plan Reference

- `/home/daniel/pidex/agents.output/planning/dashboard-mobile-design-limits-plan.md`
- ID: `dashboard-mobile-design-limits-plan`
- UUID: `eec388ea`

## Implementation Reference

- `/home/daniel/pidex/agents.output/implementation/dashboard-mobile-design-limits-implementation.md`

## QA Failure Reference

- `/home/daniel/pidex/agents.output/qa/dashboard-mobile-design-limits-qa.md`
- Failed route: `/pipelines`
- Error: `TypeError: Cannot convert object to primitive value`

## Date

2026-05-12

## Reviewer

pidex-code-reviewer

## Overview

QA hotfix reviewed. `routes/pipelines.tsx` now rejects object-valued display fields before text/date/number rendering and before row-key construction. Fetch endpoint now fixed string `/api/pipelines`, removing search-object interpolation path. No route path or API contract change found.

## Files Reviewed

| File | Purpose | Reviewed |
|---|---|---|
| `routes/pipelines.tsx` | Safe value formatting, endpoint, row key | yes |
| `tests/dashboard-copy-and-interactions.test.mjs` | Static regression guard for pipelines crash path | yes |
| `package.json` | Version/dependency drift check | yes |

## Findings

### Critical

None.

### Major

None.

### Minor

- Test quality note — `tests/dashboard-copy-and-interactions.test.mjs:100` checks source structure with regex, not runtime rendering with object payload. Acceptable for narrow QA hotfix because implementation also records browser smoke pass and code path is simple. Future improvement: add component/runtime test that renders object-valued `project`/`plan_key` payload and asserts no console error.

## Positive Observations

- `routes/pipelines.tsx:20` `formatText` handles nullish, object, blank values.
- `routes/pipelines.tsx:27` `formatDate` routes through safe text coercion before `Date` parsing.
- `routes/pipelines.tsx:35` `formatNumber` rejects object/symbol before `Number(...)`.
- `routes/pipelines.tsx:53` endpoint fixed to `/api/pipelines`; no search object coercion.
- `routes/pipelines.tsx:113` row key uses formatted primitives plus index; raw object interpolation removed.
- `routes/pipelines.tsx:115-116` object-prone cells use `formatText`.

## UI Pattern Parity Review

| Surface | Source pattern checked | Target files checked | Parity result | Findings |
|---|---|---|---|---|
| `/pipelines` table | Plan requires semantic table + contained overflow + no route/API regression | `routes/pipelines.tsx` | PASS | Table remains semantic, `table-scroll` preserved, route unchanged |

## Execution Profile Diff Guard

| Approved profile | Actual diff class | Skips affected | Verdict |
|---|---|---|---|
| `ui-heavy`; security not skipped | Narrow TSX route hotfix + test update | No new skipped gate needed after QA failure fix | PASS |

## Hotfix Lane Runtime Proof

- Runtime surface changed: `routes/pipelines.tsx` only for crash fix; no API route/server contract touched.
- Targeted test: `node --test tests/dashboard-copy-and-interactions.test.mjs` — PASS, 8/8.
- Full static gates: `npm run typecheck` — PASS; `npm run build` — PASS.
- Implementation evidence: Playwright smoke `npx playwright test tmp-qa-playwright.spec.mjs --reporter=line` — PASS, 1 passed.

## Fallow Evidence

- Command: `cd /home/daniel/pidex/dashboard && npx fallow audit --format json --quiet --explain 2>/dev/null || true`
- Outcome: PASS_WITH_FINDINGS
- Review impact: Non-blocking. Findings are broad pre-existing complexity/duplication; only touched hotfix-relevant item is `routes/pipelines.tsx:35 formatNumber` CRAP/high due no coverage. Simplicity acceptable for narrow guard.

## Version Verification

- Dashboard package: `pidex-dashboard@0.1.0`.
- Relevant dependency versions match QA observed plan context: `@tanstack/react-router 1.169.2`, `@tanstack/react-start 1.167.71`, `react 19.1.0`.
- No new dependency added.

## Security Scope Assessment

- New API routes/server actions/data mutations: no.
- Auth/authz touched: no.
- New dependencies: no.
- User-supplied input in new code path: no.
- Scope: client-side display coercion + regression test after security review already completed.
- Security skip for re-review: allowed; route directly back to QA for failed smoke rerun.

## Verdict

APPROVED

## Rationale

Fix targets exact failure class. Object values no longer reach string interpolation or number conversion in `/pipelines` render path. Endpoint contract preserved. Tests and validation evidence sufficient for QA rerun.

## Next Action

Route to pidex-qa. Re-run browser smoke on `/pipelines` desktop/mobile and confirm zero console errors.

<!-- ROUTING
verdict: APPROVED
route_to: pidex-qa
reason: QA hotfix approved; /pipelines object coercion guarded, endpoint contract preserved, tests/typecheck/build pass
context_file: /home/daniel/pidex/agents.output/review/dashboard-mobile-design-limits-code-review-after-qa.md
-->
