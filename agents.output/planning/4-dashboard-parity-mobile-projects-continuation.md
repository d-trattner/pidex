---
ID: 4
Origin: 4
UUID: 5098e241
Status: In Progress
Target Release: TBD — inherited from original plan; roadmap not supplied in direct-mode inputs
Epic: Dashboard parity mobile/project selector
---

# Continuation Plan: Dashboard Parity Mobile Projects

## Changelog
- 2026-05-12: Continuation plan after implementer partial BLOCKED; remaining slices only.

## Value Statement and Business Objective
As dashboard user, I want mobile-readable Quality diagnostics, shareable project-scoped views, and historical token pagination, so that I can triage PIDEX health across all projects or one project without leaving current TanStack dashboard.

## Continuation Objective
Finish approved remaining implementation scope without reworking completed backend token pagination helper/API slice. Preserve current dashboard glass/TanStack visual language. Keep scope focused on selector rollout, route query wiring, Tokens controls, Quality mobile/parity UI, and final validation/release cleanup.

## Source Context
- Original plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`.
- Partial implementation: `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation.md`.
- Completed: token pagination helper, focused pagination tests, `tokenConsumption` API helper wiring, typecheck pass.
- Modified/created by prior implementer:
  - `dashboard/lib/server/api.ts`
  - `dashboard/lib/server/token-pagination.ts`
  - `dashboard/lib/server/token-consumption-pagination.tdd.test.mjs`

## Remaining Scope
1. Global project selector and URL query state.
2. Project query wiring across approved dashboard routes/APIs.
3. Tokens weekly/monthly Older/Newer UI controls using existing pagination metadata.
4. Quality mobile one-card-per-row layout.
5. Approved Quality parity subset: gate friction, malformed routing trend, G9 events/rejections, merge dispositions/classifications.
6. Focused validation and release cleanup if artifacts require.

## Out of Scope
- Rewriting completed token pagination helper unless defect found.
- Full old dashboard recreation.
- Runs per-column filters.
- Dedicated secondary/malformed pages.
- Route hierarchy, theme, typography, or broad dashboard redesign.
- LocalStorage-first project persistence; URL query remains source.

## Assumptions
- `project` query param remains canonical.
- Missing/empty `project` means `All projects`.
- Existing filter helpers should own sanitization and server-side filtering.
- Project selector can reuse existing navigation/header/mobile sheet patterns.
- Completed token pagination API now returns enough metadata for UI controls.

## Open Questions
- None blocking. Target release remains inherited TBD.

## Plan

### Slice 1 — Project selector tracer bullet
Objective: Prove global project scope end-to-end on one representative route before broad rollout.
Acceptance criteria:
- Header/global nav exposes selector with `All projects` and discovered project values.
- Selecting project updates URL query; choosing `All projects` removes/clears `project`.
- One representative route fetch honors selected project while all-project default remains unchanged.
- Unrelated query params remain preserved.
Dependencies: existing navigation and project list source.
Owner: pidex-implementer.

### Slice 2 — Route-wide project query rollout
Objective: Apply same project contract to all approved dashboard surfaces.
Acceptance criteria:
- Overview, Runs, Pipelines, Quality/model-quality, Tokens, and Live honor active project.
- Mobile nav/header selector has same behavior as desktop.
- Dashboard navigation preserves active `project` while moving between scoped routes.
- Project change resets Tokens pagination to newest window.
Dependencies: Slice 1.
Owner: pidex-implementer.

### Slice 3 — Tokens UI pagination controls
Objective: Surface completed weekly/monthly token pagination contract in UI.
Acceptance criteria:
- Tokens route renders Older/Newer controls for weekly and monthly token views/sections.
- Controls update `page` query state and request matching API page.
- Controls disable/hide per `has_older` and `has_newer` metadata.
- Selected project is included in token requests and page reset behavior works on project change.
Dependencies: completed backend helper/API wiring; Slice 2 for project state.
Owner: pidex-implementer.

### Slice 4 — Quality mobile layout and approved parity subset
Objective: Restore readable mobile Quality diagnostics and approved parity surfaces.
Acceptance criteria:
- `/quality` mobile viewport stacks each chart/card one per row.
- Desktop Quality grid remains multi-column where current design intends.
- Quality page adds approved subset only: gate friction, malformed routing trend, G9 events/rejections, merge dispositions, merge classifications.
- New cards/charts use current glass/card/chart primitives and scoped project data.
Dependencies: Slice 2.
Owner: pidex-implementer.

### Slice 5 — Cleanup, validation, release metadata
Objective: Leave coherent handoff with no dead transition work.
Acceptance criteria:
- Project standard typecheck/build/static checks pass.
- Existing and newly relevant focused tests pass; prior pagination test remains green.
- Browser smoke evidence captured only under `.playwright/` if screenshots are produced; `.playwright/` ignored before capture.
- Changelog/version/release note updated only if project release process requires; otherwise document no-op in implementation handoff.
Dependencies: Slices 1-4.
Owner: pidex-implementer.

## Validation
High-level evidence expected from implementer:
- Static/type validation for dashboard.
- Focused coverage for project query helper/plumbing and token UI metadata consumption.
- Route/API behavior confirms all-project default and selected-project filtering.
- UI render validation confirms selector, Tokens controls, Quality mobile stacking.
- Security hygiene: query params sanitized through existing helpers; no raw SQL/upstream errors returned.
- Accessibility hygiene: selector and pagination controls named, keyboard reachable, focus visible, mobile targets usable.

## User Preview Requirement
UI involved: yes. Post-devops user preview before implementation close remains required. Preview should show `/quality`, `/tokens`, mobile nav/header selector, and one selected-project route. QA/UAT/browser evidence does not replace user preview.

## Risks and Mitigations
- Broad route wiring drift: keep single query-state helper/pattern; update route checklist once.
- Sparse local token history: use controlled/known multi-window data where available; do not fake metadata in UI.
- Quality clutter: approved subset only; preserve current hierarchy.
- Mobile regression: keep desktop classes intact; constrain mobile stacking to small viewport behavior.

## Handoff Notes
- Continue from existing dirty repo state; scope edits to remaining slices plus necessary fixes.
- Do not repeat completed backend pagination work except integration defects.
- Complexity-first order retained: selector/query contract before UI rollout; release cleanup last.
- Open-question scan: no unresolved blocking questions.

<!-- ROUTING -->
verdict: COMPLETE
route_to: pidex-implementer
context_file: agents.output/planning/4-dashboard-parity-mobile-projects-continuation.md
gate: none
reason: Remaining implementation slices scoped after coherent partial token pagination completion.
<!-- /ROUTING -->
