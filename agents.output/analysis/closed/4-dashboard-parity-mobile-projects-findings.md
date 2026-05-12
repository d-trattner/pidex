---
ID: 4
Origin: 4
UUID: 5098e241
Status: Complete
---

# Dashboard Parity Mobile Projects Findings

## Changelog
- 2026-05-12: Completed targeted old/new dashboard parity analysis.

## Value Statement and Business Objective
Mobile dashboard must show core quality/token data clearly and preserve old dashboard capabilities while keeping current TanStack UI. Findings unblock user approval before implementation.

## Objective
Compare old vs new dashboard for targeted parity gaps: mobile quality charts, global project selector, selected project API wiring, weekly/monthly token pagination, obvious old-dashboard parity gaps.

## Context
- Source inspected: `dashboard-old/scripts/server.py`, `dashboard-old/public/index.html` for old route behavior/UI call evidence, targeted `dashboard/routes/**`, `dashboard/components/navigation/global-nav.tsx`, `dashboard/lib/server/api.ts`, `dashboard/lib/server/filters.ts`, `dashboard/routes/api/**`.
- No code changed.

## Methodology
- Targeted source inspection.
- Old route behavior compared to new API wrappers and pages.
- UI parity assessed from old single-page dashboard components vs new TanStack route components.

## Findings Table

| Finding | Old evidence | New evidence | User value | Likely files | Implementation risk | Recommendation |
|---|---|---|---|---|---|---|
| Mobile quality chart layout needs one chart per row | Old CSS media query sets `.chart-grid`, `.grid`, `.chart-side-layout` to `grid-template-columns:1fr` at max-width 1000px in `dashboard-old/public/index.html:38`; old `ChartBox` cards use full/wide responsive classes. | New `.glass-card { grid-column: span 4; }` in `dashboard/app/styles/theme.css`; no mobile media override for `.grid` or `.glass-card`. New `dashboard/routes/quality.tsx` uses bare `<article className="glass-card glass">` for charts. On narrow screens 12-col grid + span 4 can keep 3 squeezed columns, not one row. | Mobile readability; prevents tiny charts and labels. | `dashboard/app/styles/theme.css`, maybe `dashboard/routes/quality.tsx`. | Low. CSS-scoped. | Include. |
| Global project selector missing | Old `ProjectMenu` renders `All Projects` plus project buttons, stores selection, and passes project to `useAllData`; `dashboard-old/public/index.html:116-119`. | New `GlobalHeader` only title + nav; `MobileMenuSheet` only nav links. No project state/provider in `dashboard/components/navigation/global-nav.tsx`. | Core cross-project comparison and focused project view. | `dashboard/components/navigation/global-nav.tsx`, shared client utility/context if used. | Medium. Needs route-wide state/query propagation. | Include. |
| Project selection not wired into new views | Old `useAllData(project)` appends `?project=` to summary/live/secondary/pipelines/charts/malformed/runs/model-quality; token tab fetches weekly/monthly with project too. | New pages fetch fixed endpoints: `overview.tsx` `/api/summary`; `runs.tsx` `/api/runs?limit=20`; `pipelines.tsx` `/api/pipelines`; `quality.tsx` `/api/charts/quality` and `/api/charts/model-quality`; `tokens.tsx` `/api/token-consumption?granularity=week`. | Selector must change data, not just UI. | All data pages listed; shared query helper preferable. | Medium. Broad but repetitive. | Include. |
| API project support exists for most endpoints but live route drops filter | Old `/api/live` calls `live_state(where, params)` from `project_filter(parsed)` in `dashboard-old/scripts/server.py`. | New `getLiveState()` accepts no search string and `/api/live` calls it without request URL. Other new APIs mostly call parseProjectFilter. | Consistent project-scoped live/status view. | `dashboard/routes/api/live.tsx`, `dashboard/lib/server/api.ts`, `dashboard/routes/live.tsx`. | Medium. SQL clauses already similar in old code; new function needs search-aware filtering. | Include if live should be in project selector scope; otherwise defer with explicit note. |
| Weekly token pagination incomplete | Old `token_consumption_data` aligns max timestamp to week start, applies `page`, returns 7 day rows, `has_older`, `has_newer`; UI has Older/Newer week buttons. | New `tokenConsumption` parses `page` but slices `sortedBuckets.slice(-window)` with `window=1` for week; returns one bucket, `has_older:false`, `has_newer:false`, page unused for slicing. New `tokens.tsx` has no buttons and only fetches week page 0. | User can inspect historical token usage beyond latest week/day. | `dashboard/lib/server/api.ts`, `dashboard/routes/tokens.tsx`. | Medium. Old algorithm portable. | Include. |
| Monthly token view missing/incomplete | Old token tab fetches both `granularity=week&page=` and `granularity=month&page=`, renders monthly chart with Older/Newer months buttons. | New `tokens.tsx` never fetches `granularity=month`; API returns monthly only for direct callers and sets `has_older:false`, `has_newer:false`; page not used. | Historical monthly spend/token trend. | `dashboard/routes/tokens.tsx`, `dashboard/lib/server/api.ts`. | Medium. | Include. |
| Quality API omits old `qualityImpactByDay` computation | Old `/api/charts/quality` computes `qualityImpactByDay` SQL joining pipeline_day, agent_day, secondary_day, finding_day and returns `infraMarkers`. | New `qualityChartData` returns `qualityImpactByDay: []` and `infraMarkers: {}`. New UI does not render impact chart. | Shows whether process changes improved completion, success, routing health, useful findings. | `dashboard/lib/server/api.ts`, `dashboard/routes/quality.tsx`. | Medium. Query exists in old code, but port has SQL composition complexity. | Include only if parity priority includes old quality impact; otherwise defer. |
| Many old quality charts not surfaced in new UI despite API fields | Old `Quality` renders completion, quality impact, secondary clean/malformed, merge dispositions, merge classifications, avg runtime, cost by model, gate friction, malformed trend, rework, planner revisions, G9 events/rejections, analyst verdicts. | New `quality.tsx` renders completion, runtime, top models, secondary pie, and summary cards. It fetches but does not display mergeDisposition, mergeClassification, malformedByDay, g9ByDay, gatesByPipeline, reworkByPipeline, plannerRevisionsByPlan, analystVerdicts, qualityImpactByDay. | Restores operational diagnostics from old dashboard without data-model change. | `dashboard/routes/quality.tsx`. | Medium-high if all restored; lower if high-value subset. | Include high-confidence subset: gate friction, malformed trend, G9, merge dispositions/classifications. Defer full old dashboard recreation. |
| Runs page lost per-column filters | Old `Runs` has filters for project, plan_key, agent, provider, model, verdict, route_to and provider historical filtering. | New `runs.tsx` renders latest 20 table only; header text mentions filters but no UI. API supports `show_historical`, `provider`, `project`, `limit`. | Fast triage in large run sets. | `dashboard/routes/runs.tsx`. | Medium. Client-only controls plus API params already present. | Defer unless user wants obvious parity beyond stated priorities. |
| Analysis/secondary/malformed old tabs partly represented but not full parity | Old analytics subtab includes secondary health, malformed artifacts, analysis docs. | New has `/analysis`; no top nav route for secondary/malformed; APIs exist `/api/secondary`, `/api/malformed`. | Niche diagnostics. | New routes if wanted. | Medium. | Defer. |

## Proposed Implementation Scope
- Mobile layout fix: one chart/card per row on narrow screens; preserve desktop grid.
- Global project selector with `All projects` option in header/mobile sheet or shared top control.
- Wire selected project into data fetches for overview, runs, pipelines, quality, model quality, tokens; include live if selector intended global.
- Token API weekly/monthly pagination: port old date-window logic; expose correct `has_older`/`has_newer`; reset page on project change.
- Token UI: weekly and monthly views with Older/Newer controls.
- Quality parity subset: surface high-confidence existing API fields missing from UI: gate friction, malformed routing trend, G9 events/rejections, merge dispositions/classifications. Consider quality impact if API port included.

## Deferred/Needs Decision
- Full old quality dashboard recreation, including all charts and marker side-lists.
- Runs page full per-column filters.
- Secondary and malformed dedicated pages/routes.
- Persist project selection in localStorage vs URL query. Old used localStorage; new routed app may prefer URL for shareable state. Decision needed before implementation.
- Live project filtering: include if “global selector” means every dashboard route; otherwise document live as global operational view.

## Root Cause
Verified root cause: new TanStack dashboard reimplemented pages and API wrappers but did not port old app-level state/data orchestration. Old dashboard had one `project` state feeding all data loads and token pagination state inside token component. New pages independently fetch static URLs, so project selector, pagination, and several old quality surfaces are absent even where server data exists.

## System Weaknesses
- No shared dashboard query state. Each page hardcodes fetch URL; parity work duplicates query wiring risk.
- API parity not tested against old behavior. `page` parsed but not applied in new token API.
- UI parity not tracked by route. API fields can exist while views omit them.
- Mobile layout depends on desktop grid default; no responsive card override.

## Instrumentation Gaps
- Normal: route data-load log/event with route, project, endpoint, status, row counts. Helps verify selector changes data.
- Normal: API response metadata for token windows: granularity, page, start, end, has_older, has_newer, row_count.
- Debug: temporary client console/debug panel showing active project and generated endpoint URLs per page.
- Debug: screenshot/viewport regression captures for quality page at mobile widths.

## Analysis Recommendations
- Before implementation, choose URL query vs localStorage for project state.
- Test API parity using sample calls: `/api/token-consumption?granularity=week&page=1`, `/api/token-consumption?granularity=month&page=1`, and same with `project=`.
- After implementation, run mobile viewport check for `/quality`: each chart card full-width row.
- Add regression assertions for token `has_older/has_newer` using seeded or existing DB with >1 week/month data.

## Open Questions / Remaining Gaps
- No browser runtime screenshot captured; mobile finding is code-based from CSS/layout only.
- No DB sample queried; token pagination behavior verified from code path, not live data output.
- User decision needed: project selector persistence mechanism and whether live/limits/analysis should honor project.
- User decision needed: how much old quality chart set to restore now vs roadmap.

<!-- ROUTING
verdict: COMPLETE
route_to: user
context_file: agents.output/analysis/4-dashboard-parity-mobile-projects-findings.md
gate: none
remaining_gaps:
  - No browser screenshot or DB sample run; findings code-evidence based.
  - Need user approval on proposed scope and project-state persistence.
reason: findings ready for user approval before planning/implementation
-->
