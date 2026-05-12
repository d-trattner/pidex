---
ID: 4
Origin: 4
UUID: 5098e241
Status: Active
Target Release: TBD — roadmap not supplied in direct-mode inputs
Epic: Dashboard parity mobile/project selector
---

# Dashboard Parity Mobile Projects Plan

## Changelog
- 2026-05-12: Initial plan from approved findings.
- 2026-05-12: G1 revision addresses C1/C2: supported `ui-heavy` execution profile, designer not skipped, security retained.

## Value Statement and Business Objective
As dashboard user, I want mobile-readable Quality diagnostics, shareable project-scoped views, and historical token pagination, so that I can triage PIDEX health across all projects or one project without leaving current TanStack dashboard.

## Objective
Restore approved high-confidence old-dashboard parity while preserving current glass/TanStack visual language. Deliver mobile Quality layout fix, global URL-backed project selector, route/API project filtering, weekly/monthly token pagination, and selected Quality diagnostic surfaces.

## Epic Alignment and Target Release
- Epic: Improve PIDEX TanStack dashboard by restoring high-confidence old-dashboard parity while preserving current design.
- Target Release: TBD. Roadmap not read in this direct-mode task; release version requires roadmap confirmation. Keep as TBD unless orchestrator supplies release target.

## UI Intent Contract / UI Preservation Classification
- Classification: preserve-mostly.
- Preserve: current dashboard glass visual language, TanStack routes, existing nav information architecture, desktop grid density.
- Change: add project selector control in global header/mobile menu, mobile Quality card stacking, additional Quality cards/charts using existing styling primitives, token pagination controls.
- Do not redesign: theme, typography scale, chart visual identity, route hierarchy.

## UI Intent Boundary

### Must Preserve
- Existing glass card/charts visual language.
- Existing desktop Quality multi-column grid density.
- Existing route names and top-level dashboard navigation.
- Existing all-project default behavior when no project selected.

### May Change
- Header/mobile nav may add project selector.
- Existing data fetch URLs may gain `project` and token `page` params.
- Quality route may add approved diagnostic cards/charts.
- Mobile Quality grid/card classes may change to stack cards.

### Forbidden Changes
- No old dashboard visual recreation.
- No route hierarchy rewrite.
- No full Quality dashboard recreation.
- No runs per-column filter implementation.
- No secondary/malformed dedicated route work.

### Source-of-Truth Screens / Files
- New current UI source: `dashboard/routes/quality.tsx`, `dashboard/routes/tokens.tsx`, `dashboard/components/navigation/global-nav.tsx`.
- Old behavior reference: `dashboard-old/public/index.html`, `dashboard-old/scripts/server.py`.
- Exact layout parity element: route `/quality` → chart/card `<article className="glass-card glass">` elements inside current grid; mobile target is each article full row at `375×812`, desktop target preserves current multi-column row placement.

## Existing UI Parity Contract
| Existing behavior/layout | Keep/change? | New mapping | Evidence needed |
|---|---|---|---|
| Current dashboard glass visual style | KEEP | Added controls/cards use same primitives and theme tokens | Screenshots SM-1 through SM-6 |
| Current desktop Quality grid | KEEP | Desktop remains multi-column | SM-2 |
| Old mobile Quality one-card-per-row readability | ADAPT | Current Quality cards stack one per row on mobile | SM-1 |
| Old global project scope | CHANGE | URL query-backed selector replaces old local state | SM-3, SM-4 |
| Old weekly/monthly token historical navigation | ADAPT | Current Tokens route gains Older/Newer pagination | SM-5, SM-6 |
| Old Quality diagnostic subset | ADAPT | Approved subset only: gates, malformed trend, G9, merge dispositions/classifications | SM-1, SM-2 |

## Designer Meeting / Temporary Preview
| Field | Value |
|---|---|
| UI-heavy detected | yes |
| User requested designer meeting | no |
| Temporary preview required | no separate designer preview before designer; standard user preview still required |
| Preview artifact/path/URL | local dashboard URL, TBD by devops |
| Reason | UI-heavy scope includes header/mobile selector, responsive Quality layout, token controls, accessibility, and screenshots. Route to pidex-designer after critic approval; preserve-mostly does not justify skipping design gate. |

## Execution Profile

Execution Profile: ui-heavy
Reason: navigation/mobile layout/UI parity drives supported profile. Security remains required because API/query-state/token pagination changes touch server/data paths; visual and security gates both needed.

Skipped Agents:
| Agent | Skip? | Reason | Safety condition |
|---|---:|---|---|
| pidex-analyst | yes | Approved findings supplied as input. | Critic finds no unverified API/product gap. |
| pidex-architect | yes | No new architecture boundary; reuse existing route/filter patterns. | Critic finds no structural contract or scalability question. |
| pidex-designer | no | UI-heavy work affects header/mobile selector, responsive charts, token controls, accessibility, and screenshot matrix. | Design review required after critic approval. |
| pidex-security | no | API/query behavior changes. | Security review required by route security contract. |
| pidex-qa | no | Product UI/API changes. | Full QA/browser validation required downstream. |
| pidex-critic | no | Mandatory gate for this plan. | None. |

- Scope shape: UI + API route/data behavior across existing dashboard surfaces.
- Complexity: medium; broad repetitive query wiring plus token window correctness.
- Slice order: complexity-first; core query/API contract before mechanical rollout/version work.

## Retro Mode
- Retro Mode: mini
- Retro reason: normal UI/API feature work; no rejection/security finding/process incident currently present.
- Post-retro handoffs: none unless downstream gates produce findings.

## Scope
1. `/quality` mobile layout: one chart/card per row at mobile width; desktop grid preserved.
2. Global project selector with `All projects`, backed by URL query state.
3. Project selection affects Overview, Runs, Pipelines, Quality/model-quality, Tokens, Live.
4. Weekly and monthly Tokens pagination: `page`, `has_older`, `has_newer` behavior matching old dashboard intent.
5. Quality parity subset: gate friction, malformed routing trend, G9 events/rejections, merge dispositions/classifications.

## Out of Scope
- Full old Quality dashboard recreation.
- Runs per-column filters.
- Dedicated secondary/malformed pages.
- LocalStorage-first project persistence. URL query state is required for shareable links.
- Broad redesign or route reorganization.
- New analytics domains beyond approved parity subset.

## Assumptions
- Existing API project filter helpers remain preferred source for filtering semantics.
- Existing chart/card components can express added Quality surfaces without new design system.
- URL param name `project` remains compatible with API behavior and old dashboard semantics.
- `All projects` represented by absent/empty `project` query param in API calls.

## Open Questions
- None blocking. Target release remains TBD because roadmap not supplied in task inputs.

## Architecture and API Notes
- Keep shared query-state behavior DRY. One helper/hook/pattern should read/write active project and preserve unrelated query params.
- API behavior: endpoints accepting project scope should treat missing/empty project as all projects and explicit project as exact supported filter.
- Token API behavior: weekly/monthly calls should apply `page` to historical windows, return aligned window metadata where available, and set `has_older`/`has_newer` truthfully.
- Live API behavior: `/api/live` should accept same project query semantics as other listed routes.
- Maintain SOLID/KISS: selector state ownership isolated; page fetchers consume query state, not duplicate state machines.

## Plan Slices

| Slice | Description | Spawn |
|---|---|---|
| 1 | Project query contract tracer bullet | A |
| 2 | Roll project selector through required routes | A |
| 3 | Token weekly/monthly pagination parity | A |
| 4 | Quality mobile layout and approved parity surfaces | B |
| 5 | Release metadata and cleanup | B |

**Spawn plan (PROC-7)**:
- ⟪Spawn A: Slices 1-3⟫ — query/API contract plus token core behavior, ~25-30 tool-calls.
- ⟪Spawn B: Slices 4-5⟫ — Quality UI rollout plus release prep, ~15-25 tool-calls.
- Orchestrator may use two pidex-implementer sessions if Spawn A reaches budget ceiling after committed work.

### Slice 1 — Project query contract tracer bullet
Objective: Prove end-to-end project selection changes one existing route and one API response path without disrupting all-project default.
Acceptance criteria:
- Header exposes project selector with `All projects` and available project values.
- Selecting project updates URL query state; `All projects` removes or clears `project` query.
- One representative route, preferably Overview, appends active project to data request.
- API behavior preserves existing all-project response when no project selected.
Dependencies: existing project list source or endpoint; current navigation/header.
Owner: implementer.

### Slice 2 — Roll project selector through required routes
Objective: Make selector global for approved dashboard surfaces.
Acceptance criteria:
- Overview, Runs, Pipelines, Quality/model-quality, Tokens, and Live honor active project.
- Mobile menu/header access preserves same selector behavior.
- Route navigation preserves active project where user remains inside dashboard.
- Project change resets token pagination to newest window.
Dependencies: Slice 1 query contract.
Owner: implementer.

### Slice 3 — Token weekly/monthly pagination parity
Objective: Restore old-dashboard historical token navigation for week and month granularities.
Acceptance criteria:
- `/api/token-consumption` applies `granularity=week|month`, `page`, and optional `project` consistently.
- Response includes correct `has_older` and `has_newer` for available history.
- Tokens page renders weekly and monthly sections/views with Older/Newer controls.
- Controls disable or hide when corresponding metadata says no older/newer window exists.
Dependencies: Slice 2 project query integration for Tokens.
Owner: implementer.

### Slice 4 — Quality mobile layout and approved parity surfaces
Objective: Improve Quality readability and restore selected diagnostics.
Acceptance criteria:
- Mobile Quality viewport renders each chart/card one per row.
- Desktop Quality layout remains multi-column where currently intended.
- Quality page renders gate friction, malformed routing trend, G9 events/rejections, merge dispositions, and merge classifications using existing data fields or API extensions.
- Added surfaces use current dashboard glass/card/chart language.
Dependencies: Slice 2 project query integration for Quality.
Owner: implementer.

### Slice 5 — Release metadata and cleanup
Objective: Prepare release artifact changes after functionality lands.
Acceptance criteria:
- Version/release artifacts updated if project release process requires.
- Changelog or equivalent user-facing release note mentions mobile Quality, project selector, token pagination, Quality parity subset.
- No source comments or dead paths left from transition.
Dependencies: Slices 1-4.
Owner: implementer.

## Files and Surfaces
Likely surfaces from findings:
- `dashboard/components/navigation/global-nav.tsx`: selector in desktop/mobile navigation.
- `dashboard/routes/overview.tsx`: project-scoped summary fetch.
- `dashboard/routes/runs.tsx`: project-scoped runs fetch.
- `dashboard/routes/pipelines.tsx`: project-scoped pipelines fetch.
- `dashboard/routes/quality.tsx`: project-scoped charts/model quality; added parity surfaces; mobile card behavior if route-level classes needed.
- `dashboard/routes/tokens.tsx`: project-scoped weekly/monthly views and pagination controls.
- `dashboard/routes/live.tsx`: project-scoped live fetch.
- `dashboard/routes/api/live.tsx`: parse/pass project query.
- `dashboard/routes/api/token-consumption.tsx` or route equivalent: expose token pagination semantics.
- `dashboard/lib/server/api.ts`: token window logic, live filtering, quality data extensions if fields absent.
- `dashboard/lib/server/filters.ts`: reuse existing filter parsing; avoid duplicate SQL/query semantics.
- `dashboard/app/styles/theme.css`: mobile grid/card stacking rule.

## Testing Strategy
**Gate G9**: required — UI surfaces, CSS/layout, navigation, and API response behavior consumed by routes change.

High-level expected coverage only; pidex-qa owns detailed test cases.

| Validation ID | Area | Expected evidence |
|---|---|---|
| V-1 | Static/type validation | Project standard typecheck/build pass. |
| V-2 | API/project behavior | Project query helper/filter behavior covered at route/API level; all-project default preserved. |
| V-3 | Token pagination | Weekly/monthly `page`, `has_older`, `has_newer`, and project scope covered with controlled multi-window data. |
| V-4 | UI render contracts | Required routes render active project state and pagination affordances. |
| V-5 | Playwright browser smoke | Desktop `1280×720` + mobile `375×812`: 0 console errors, non-transparent body background, `--color-bg-0` non-empty, center hit-test reaches expected interactive/page element, no invisible overlay blocks controls. |
| V-6 | Screenshot artifacts | All Screenshot Matrix rows captured under `.playwright/` only; `.gitignore` covers `.playwright/` before screenshots are produced. |
| V-7 | Accessibility baseline | New selector and pagination controls have accessible names, keyboard access, visible focus, disabled state semantics, and 44px mobile touch targets. |
| V-8 | Security | Project/page query params sanitized through existing helpers; raw errors/query values not leaked in API responses. |

## Route Security Contract
| Route/API behavior | Status code | Outward error string | Non-leak proof |
|---|---:|---|---|
| `/api/live?project=...` success/all projects | 200 | none | Uses parsed filter; no raw query echoed as error. |
| `/api/live?project=...` invalid/internal failure | 500 | generic dashboard API error | Raw SQL/upstream error logged server-side only, never returned. |
| `/api/token-consumption?granularity=week|month&page=...&project=...` success | 200 | none | Response contains normalized metadata, not SQL/filter internals. |
| `/api/token-consumption` invalid/internal failure | 400 or 500, matching existing route conventions | generic invalid request or dashboard API error | Raw exception and SQL text not returned. |
| Quality/model-quality project-scoped endpoints | existing success/error codes | existing generic sanitized strings | Existing error contract preserved; project input goes through filter helper. |

## UI Quality Contract

### Pattern Source
| Surface | Pattern source | Reuse decision | Parity checklist |
|---|---|---|---|
| Global selector | `dashboard/components/navigation/global-nav.tsx` current header/mobile sheet | modify | Placement in header/sheet, label `All projects`, URL persistence, keyboard/focus, mobile touch target. |
| Quality cards | `dashboard/routes/quality.tsx` current glass chart cards | modify | Current card style, loading/error behavior, desktop grid, mobile stack, added diagnostic cards. |
| Tokens pagination | `dashboard/routes/tokens.tsx` current token chart/card style + old token behavior reference | modify | Weekly/monthly sections, Older/Newer labels, disabled states, project reset, loading/error states. |

### Mobile UI Contract
| Surface | Viewport | Layout behavior | Interaction/touch behavior | Keyboard/overlay/safe-area behavior | Evidence |
|---|---|---|---|---|---|
| `/quality` cards | `375×812` | One chart/card per row; no squeezed multi-column charts. | Charts/cards scroll vertically without horizontal clipping. | No fixed chrome blocks card content. | SM-1, V-5 |
| Header/mobile nav project selector | `375×812` | Selector available in mobile navigation/header flow. | Primary selector touch target at least 44px. | Sheet/menu focus usable; closing returns focus to trigger. | SM-3, V-7 |
| Tokens pagination | `375×812` | Weekly/monthly controls visible near relevant chart/list. | Older/Newer controls at least 44px; disabled state clear. | Controls reachable by keyboard; no overlay blocks buttons. | SM-5, SM-6, V-7 |

### Accessibility Baseline
| Surface/control | Label/name | Keyboard/focus expectation | Status/error announcement | Contrast/touch target expectation | Evidence |
|---|---|---|---|---|---|
| Project selector | Accessible name identifies project scope; option includes `All projects`. | Tab reachable; arrows/enter/escape or native select semantics work; focus visible. | Loading/error route states remain discoverable. | WCAG AA contrast; 44px target on mobile. | V-7 |
| Token Older/Newer controls | Button names include week/month context where needed. | Tab order follows content order; disabled controls not actionable. | Disabled/no-history state exposed semantically. | WCAG AA contrast; 44px target on mobile. | V-7 |
| Mobile nav/sheet | Trigger and close controls named. | Focus contained while open and returned on close. | None beyond existing route error states. | Overlay contrast and touch targets preserved. | V-7 |

## Validation Notes
- Performance: added API filters should reuse existing indexed/filter paths; no route should fetch every project then client-filter large data.
- Security: project query must be parameterized/sanitized through existing filter helpers; no SQL string interpolation from raw URL input.
- G9 required because user-visible UI and API-fed route behavior change.

## User Preview Requirement
| Field | Value |
|---|---|
| UI involved | yes |
| Preview required before G4 | yes |
| Preview command | TBD by devops/project scripts |
| Preview URL/port | TBD by devops/project scripts |
| Routes/screens to inspect | `/quality`, overview route, `/tokens`, mobile nav/header, one selected-project route |
| Mobile viewport needed | yes — `375×812` minimum |

Post-devops user preview required before G4/implementation close. User must see running dashboard with mobile Quality, project selector, and token pagination. QA/UAT browser evidence does not replace user preview.

## Screenshot Artifact Directory
- Bound artifact directory: `.playwright/`.
- Screenshot binaries must not be staged outside `.playwright/`.
- If `.playwright/` missing from `.gitignore`, implementation must add ignore coverage before browser capture.

## Screenshot Matrix
| Screenshot ID | Surface/route | Viewport | State | Required evidence | Owner |
|---|---|---|---|---|---|
| SM-1 | `/quality` | Mobile `375×812` | Loaded all projects | One chart/card per row; approved Quality surfaces visible or reachable. | QA/UAT |
| SM-2 | `/quality` | Desktop `1280×720` | Loaded all projects | Desktop multi-column layout preserved. | QA/UAT |
| SM-3 | Header/mobile nav | Mobile `375×812` | Nav/selector open | Project selector visible with `All projects`; overlay does not block controls. | QA/UAT |
| SM-4 | Overview route | Desktop `1280×720` | Selected project | URL contains project query; visible state reflects project scope. | QA/UAT |
| SM-5 | `/tokens` weekly | Desktop `1280×720` | Page 0 and page 1 where data exists | Older/Newer controls and metadata behavior visible. | QA/UAT |
| SM-6 | `/tokens` monthly | Desktop `1280×720` | Page 0 and page 1 where data exists | Older/Newer controls and metadata behavior visible. | QA/UAT |
| SM-7 | `/tokens` | Mobile `375×812` | Pagination controls | Controls readable/tappable; no horizontal clipping. | QA/UAT |

## Multi-Slice Budget Risk
Resolution: Option B — pre-declare two back-to-back implementer sessions if needed.

| Risk | Impact | Mitigation |
|---|---|---|
| Five slices exceed single implementer budget | Partial uncommitted work or stalled release prep | Spawn markers split architectural/API core into A and UI/release rollout into B. |
| Spawn boundary loses context | Duplicate decisions or drift | Slice 1-3 contracts documented in plan; Spawn B consumes committed query/token contract. |

## Risks and Mitigations
- Risk: broad route wiring causes drift. Mitigation: central query helper/pattern and route checklist.
- Risk: token history sparse in local DB hides pagination states. Mitigation: validate metadata against controlled or known multi-window data source.
- Risk: Quality page becomes cluttered. Mitigation: restore approved subset only; preserve current card hierarchy.
- Risk: Live filtering semantics differ from historical endpoints. Mitigation: reuse existing filter helpers and old dashboard behavior as reference.

## Version Management
Final slice owns version/changelog updates if release artifacts change. If no release file exists or project does not version dashboard separately, document no-op in handoff.

## Plan Lint Preflight
| Check | Result | Evidence / Action |
|---|---:|---|
| Execution Profile enum | PASS | Supported `ui-heavy` profile declared; security retained as required downstream gate due API/query/data-path changes. |
| Skipped Agents declaration | PASS | `pidex-designer`, `pidex-security`, `pidex-qa`, and `pidex-critic` not skipped. |
| Retro Mode consistency | PASS | `mini`; no mandatory full-retro trigger currently present. |
| Target release/version coherence | PASS | `TBD` explicitly tied to missing roadmap in direct-mode inputs; release artifact policy deferred to Slice 5. |
| G9 applicability | PASS | G9 required. |
| Artifact path uniqueness | PASS | Single plan path and screenshot directory `.playwright/`. |

## Handoff Notes
- Implementer should favor durable contracts over line-specific porting.
- Do not re-add deferred old-dashboard pages/features.
- Keep current UI identity; parity means capability restoration, not old UI recreation.
- Open-question scan: no blocking OPEN QUESTION items remain; target release is non-blocking TBD due missing roadmap input.

## Routing
<!-- ROUTING -->
verdict: COMPLETE
route_to: pidex-critic
context_file: agents.output/planning/4-dashboard-parity-mobile-projects-plan.md
gate: none
reason: G1 revision fixes C1/C2: supported ui-heavy profile, designer not skipped, security retained
<!-- /ROUTING -->
