---
ID: 4
Origin: 4
UUID: 5098e241
Status: Rejected
---

# Code Review v2: Dashboard Parity Mobile Projects

## Plan reference
- `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md` — ID 4 / UUID `5098e241`

## Implementation reference
- `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation-fix1.md`
- Prior review: `agents.output/code-review/4-dashboard-parity-mobile-projects-code-review.md`

## Date
2026-05-12

## Reviewer
pidex-code-reviewer agent

## TDD Compliance Check
| Source | Status | Notes |
|---|---|---|
| Fix doc TDD table | PASS | `readPageForKey` / `setPageForKey` rows complete. |
| Test run | PASS | `node --test ...` passed 6/6. |
| Gap | FAIL | No test for project change resetting scoped token pages. |

## Overview
M1 and M2 fixed by code inspection. Monthly token UI exists and uses monthly API metadata. Live API forwards search and applies project filter across live queries.

New blocker found: project selector no longer resets token pagination after switch because new token keys are `page_week` / `page_month`, but selector helper deletes only legacy `page`.

## Files Reviewed
| File | Status | Notes |
|---|---|---|
| `dashboard/routes/tokens.tsx` | Reviewed | Week/month fetches, controls, metadata. |
| `dashboard/lib/client/project-query.ts` | Reviewed | Scoped page helpers; reset bug. |
| `dashboard/lib/client/token-pages.tdd.test.mjs` | Reviewed | Focused helper tests. |
| `dashboard/routes/api/live.tsx` | Reviewed | Passes request search to `getLiveState`. |
| `dashboard/lib/server/api.ts` | Reviewed | Live project filter applied to latest runs/open pipelines/latest by agent/recent secondary. |
| `dashboard/lib/server/filters.ts` | Reviewed | Parameterized project SQL fragment. |

## Findings

### Critical
None.

### Major

#### M3 — Project change preserves token page offsets
- File/line: `dashboard/lib/client/project-query.ts:33-38`, `dashboard/routes/tokens.tsx:50-57`
- Description: Tokens page now reads `page_week` and `page_month`. Project selector still calls `setProjectInSearch`, which deletes only `page`. Existing `page_week` / `page_month` survive project changes.
- Impact: Plan Slice 2 acceptance says project change resets token pagination to newest window. User can switch project while stuck on old all-project page 4, then see empty/stale historical window instead of newest selected-project tokens. QA will hit inconsistent SM-5/SM-6 behavior.
- Recommendation: Update `setProjectInSearch` to delete `page_week` and `page_month` when project changes or clears. Add TDD case: `setProjectInSearch('?project=old&page_week=2&page_month=3', 'new') === '?project=new'`.

### Minor

#### m1 — Fallow still flags complexity in changed surfaces
- File/line: `dashboard/routes/tokens.tsx:44`, `dashboard/lib/server/api.ts:498`, `dashboard/lib/server/api.ts:599`
- Description: Fallow reports high CRAP/complexity in `TokensPage`, `tokenConsumption`, and `getLiveState`.
- Impact: Maintenance risk remains, but not rejection basis for this fix pass.
- Recommendation: Later extract token view/card renderers and live query builders.

## Positive Observations
- M1 fixed: `/tokens` performs separate week/month API calls and renders Monthly view with Older/Newer controls using `payload.monthly.has_newer` / `has_older`.
- M2 fixed: `/api/live` passes `new URL(request.url).search`; `getLiveState(search)` applies parameterized project filter across live query groups.
- Focused tests and typecheck pass.

## UI Pattern Parity Review
| Surface | Result | Notes |
|---|---|---|
| Tokens monthly card | PASS | Uses existing glass card/table/button pattern. |
| Tokens project switch behavior | FAIL | Selector state does not reset scoped token pages. |
| Live project scope | PASS | Backend now receives and applies project query. |

## Execution Profile Diff Guard
| Approved profile | Actual scope | Verdict |
|---|---|---|
| `ui-heavy`; security not skipped | UI + API/data query paths | PASS_WITH_FINDING. Security still required after code review passes. |

## Fallow Evidence
- Command: `cd dashboard && npx fallow audit --format json --quiet --explain 2>/dev/null || true`
- Outcome: PASS_WITH_FINDINGS. Complexity debt noted as minor.

## Security Scope Assessment
Security review not skipped. Plan explicitly retains `pidex-security`; API/query/data paths changed. Current verdict routes to implementer first.

## Validation Run
- PASS: `cd dashboard && node --test lib/client/token-pages.tdd.test.mjs lib/client/project-query.tdd.test.mjs lib/server/token-consumption-pagination.tdd.test.mjs`
- PASS: `cd dashboard && npm run typecheck`
- NOTE: `git diff -- dashboard/routes/tokens.tsx dashboard/lib/client/project-query.ts dashboard/lib/client/token-pages.tdd.test.mjs dashboard/routes/api/live.tsx dashboard/lib/server/api.ts` produced no output in current worktree, so review used live source.

## Version Verification
- `dashboard/package.json` version `0.1.0`; plan target release `TBD`. No version drift finding.

## Verdict
REJECTED

## Rationale
M1/M2 closure verified. New acceptance blocker remains in token/project query contract: project switch must reset token pagination, but scoped page keys survive.

## Next Action
Route to `pidex-implementer`. Fix `setProjectInSearch` page-key reset and add regression test. Re-run focused tests + typecheck.

<!-- ROUTING -->
verdict: REJECTED
route_to: pidex-implementer
context_file: agents.output/code-review/4-dashboard-parity-mobile-projects-code-review-v2.md
gate: none
reason: M1/M2 fixed, but project selector preserves page_week/page_month and violates token pagination reset acceptance.
<!-- /ROUTING -->
