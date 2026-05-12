---
ID: 4
Origin: 4
UUID: 5098e241
Status: Rejected
---

# Code Review: Dashboard Parity Mobile Projects

## Plan Reference

- `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md` — ID 4 / UUID `5098e241`
- Continuation: `agents.output/planning/4-dashboard-parity-mobile-projects-continuation.md`
- Design: `agents.output/design/4-dashboard-parity-mobile-projects-design.md`
- Critic: `agents.output/critic/4-dashboard-parity-mobile-projects-critique-v2.md`

## Implementation Reference

- `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation.md`
- `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation-continuation.md`

## Date

2026-05-12

## Reviewer

pidex-code-reviewer agent

## TDD Compliance Check

| Source | Status | Notes |
|---|---|---|
| Implementation doc TDD table | PASS | `paginateTokenBuckets` row complete. |
| Continuation TDD table | PASS | `withProjectParam` / `setProjectInSearch` row complete. |
| Spot check | PASS_WITH_GAP | Unit tests cover helpers only; missed route/API integration gaps below. |

## Overview

Implementation delivers many visible pieces, but approved scope not complete. Two acceptance-critical paths fail by inspection: `/tokens` lacks monthly UI/API fetch, and `/api/live?project=...` ignores project query. Reject before QA.

## Files Reviewed

| File | Status | Notes |
|---|---|---|
| `dashboard/lib/client/project-query.ts` | Reviewed | Query helper. |
| `dashboard/lib/client/project-query.tdd.test.mjs` | Reviewed | Helper tests. |
| `dashboard/lib/server/token-pagination.ts` | Reviewed | Token page-window helper. |
| `dashboard/lib/server/token-consumption-pagination.tdd.test.mjs` | Reviewed | Helper tests. |
| `dashboard/lib/server/api.ts` | Reviewed | Project filters, token pagination, live data. |
| `dashboard/routes/api/live.tsx` | Reviewed | Live API route. |
| `dashboard/routes/api/token-consumption.tsx` | Reviewed | Token API route. |
| `dashboard/routes/api/summary.tsx` | Reviewed | Project query passes through. |
| `dashboard/routes/api/runs.tsx` | Reviewed | Project query passes through. |
| `dashboard/routes/api/pipelines.tsx` | Reviewed | Project query passes through. |
| `dashboard/routes/api/charts/quality.tsx` | Reviewed | Project query passes through. |
| `dashboard/routes/api/charts/model-quality.tsx` | Reviewed | Project query passes through. |
| `dashboard/components/navigation/global-nav.tsx` | Reviewed | Selector/nav query preservation. |
| `dashboard/routes/overview.tsx` | Reviewed | Project fetch wiring. |
| `dashboard/routes/runs.tsx` | Reviewed | Project fetch wiring. |
| `dashboard/routes/pipelines.tsx` | Reviewed | Project fetch wiring. |
| `dashboard/routes/quality.tsx` | Reviewed | Quality parity surfaces/mobile class. |
| `dashboard/routes/live.tsx` | Reviewed | Client sends project query. |
| `dashboard/routes/tokens.tsx` | Reviewed | Weekly-only UI. |
| `dashboard/app/styles/theme.css` | Reviewed | Mobile nav/quality/table styles. |

## Findings

### Critical

None.

### Major

#### M1 — Tokens page implements weekly pagination only; monthly acceptance missing

- File/line: `dashboard/routes/tokens.tsx:54`, `dashboard/routes/tokens.tsx:127-165`
- Description: Page fetches only `/api/token-consumption?granularity=week&page=...` and renders only `Weekly view`. `MonthlyPayload` type exists, but no monthly fetch, no monthly card, no monthly Older/Newer controls.
- Impact: Plan Slice 3 and design must-fix require weekly and monthly sections/views with Older/Newer controls. QA cannot validate SM-6. User loses monthly token history parity.
- Recommendation: Fetch monthly data separately or extend endpoint/client payload contract to include both granularities. Render monthly card with range/month window, rows, `has_older`/`has_newer`, and monthly-labelled controls. Add focused test/contract proof for monthly UI/API wiring.

#### M2 — `/api/live?project=...` ignores project query

- File/line: `dashboard/routes/live.tsx:187`, `dashboard/routes/api/live.tsx:9`, `dashboard/lib/server/api.ts:599-681`
- Description: Client appends `project` to `/api/live`, but API route calls `getLiveState()` with no request search. `getLiveState` accepts no search params and all live queries omit `parseProjectFilter`/`projectFilter.sql`.
- Impact: Plan scope requires active project affect Live. Selected-project Live page still returns all-project latest runs/open pipelines/secondary rows, violating shareable project-scoped views.
- Recommendation: Change route to pass `new URL(request.url).search`; update `getLiveState(search = '')` to parse project filter and apply it to every live query with joined `projects p`. Add regression test or small executable proof that `/api/live?project=<name>` excludes other projects.

### Minor

#### m1 — Fallow reports broad complexity debt in changed dashboard surfaces

- File/line: `dashboard/routes/quality.tsx:85`, `dashboard/routes/tokens.tsx:44`, `dashboard/lib/server/api.ts:498`, `dashboard/lib/server/api.ts:599`
- Description: Fallow flags high complexity/CRAP in large route functions and API functions.
- Impact: Not primary rejection reason; complexity raises maintenance risk around broad parity rollout.
- Recommendation: After functional blockers fixed, consider extracting token section components and live query helpers. Do not block fix pass solely on this.

## Positive Observations

- Project query helper preserves unrelated params and resets `page` when project changes.
- Server project filtering uses parameterized `p.name = ? OR p.path = ?`, avoiding raw interpolation.
- Quality mobile class maps top-level cards full-row below desktop breakpoint.
- Mobile sheet focus trap includes `select` and restores focus after close.

## UI Pattern Parity Review

| Surface | Source pattern checked | Target files checked | Parity result | Findings |
|---|---|---|---|---|
| Project selector | Plan/design global header + mobile sheet | `global-nav.tsx`, `project-query.ts` | Mostly pass | Placement, `All projects`, URL state present. |
| Quality mobile/cards | Plan/design Quality cards | `quality.tsx`, `theme.css` | Pass by code | `quality-card` full-row mobile; desktop span restored at `900px`. |
| Tokens pagination | Plan/design token controls | `tokens.tsx`, `api.ts` | FAIL | M1: monthly section/control absent. |
| Live project scope | Plan route scope contract | `live.tsx`, `routes/api/live.tsx`, `api.ts` | FAIL | M2: API ignores project query. |

## Execution Profile Diff Guard

| Approved profile | Actual diff class | Skips affected | Verdict |
|---|---|---|---|
| `ui-heavy`; security not skipped | UI/frontend + API query/data paths + tests | None invalidated; security still required after code review passes | PASS_WITH_FINDINGS |

## Fallow Evidence

- Command: `cd dashboard && npx fallow audit --format json --quiet --explain 2>/dev/null || true`
- Outcome: PASS_WITH_FINDINGS
- Review impact: Non-blocking complexity evidence; blockers are functional parity gaps M1/M2.

## Security Scope Assessment

Security review not skipped. Plan and critic require `pidex-security` because API/query/data paths changed. Current verdict routes to implementer first.

## Validation Run

- PASS: `cd dashboard && node --test lib/client/project-query.tdd.test.mjs lib/server/token-consumption-pagination.tdd.test.mjs`
- PASS: `cd dashboard && npm run typecheck`

## Version Verification

- `dashboard/package.json` version `0.1.0`; plan target release `TBD`. No dependency/version drift found in reviewed plan scope.

## Verdict

REJECTED

## Rationale

Approved scope requires monthly token pagination and Live project filtering. Current implementation leaves both broken/incomplete. QA would spend time confirming known failures.

## Next Action

Route to `pidex-implementer`. Fix M1/M2, add targeted proof, then re-review same doc.

<!-- ROUTING -->
verdict: REJECTED
route_to: pidex-implementer
context_file: agents.output/code-review/4-dashboard-parity-mobile-projects-code-review.md
gate: none
reason: Monthly token pagination UI absent and Live API ignores project query.
<!-- /ROUTING -->
