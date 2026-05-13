---
ID: dashboard-mobile-design-limits-plan
Origin: dashboard-mobile-design-limits-brief
UUID: eec388ea
Status: In Progress
Target Release: TBD — roadmap file absent at `agents.output/roadmap/product-roadmap.md`
Epic: Dashboard mobile usability + Limits data correctness
---

# Dashboard Mobile Design + Limits Provider Data Plan

## Changelog

| Date | Change | Reason |
|---|---|---|
| 2026-05-12 | Plan created from mobile design + limits brief | User requested implementation-ready plan |

## Value Statement and Business Objective

As dashboard user on mobile, I want readable pages, usable navigation, and accurate Limits provider data, so that I can monitor PIDEX status from phone without horizontal page breakage or missing Codex/Codex Spark limits.

## Execution Profile

Profile: `ui-heavy`
Reason: Existing shared navigation, mobile sheet, responsive layout, tables, and visible Limits data binding change.

Skipped Agents:
| Agent | Skip? | Reason | Safety condition |
|---|---:|---|---|
| pidex-analyst | yes | Limits investigation can be performed in implementation using local API/state files | Escalate if provider/API semantics cannot be verified from repo + runtime data |
| pidex-architect | yes | Root routes/API contracts preserved; no new boundary or migration | Escalate if fix requires API contract or route graph change |
| pidex-designer | no | UI-heavy mobile/nav redesign needs design artifact or visual review |
| pidex-critic | no | Mandatory gate for multi-slice UI/data plan |
| pidex-code-reviewer | no | Product TS/React/CSS changes expected |
| pidex-security | no | Server-side Limits data path may read/write state; Fallow required or FALLOW-SKIP rationale |
| pidex-qa | no | Product UI/data behavior changes need validation |
| pidex-uat/G9 | no | User-visible UI changes require preview gate |

## Skipped Agents Declaration

Only analyst and architect skipped initially. No unsafe skip declared. If implementation discovers unknown provider contract, route back to pidex-analyst. If fix needs API shape/route change, route to pidex-architect/user because brief forbids contract change.

## Retro Mode

Retro mode: none. No failed implementation artifact supplied. If G9/security/process finding occurs later, orchestrator may require mini/full retro per pipeline rules.

## Objective

Deliver mobile-safe dashboard layout across root pages, improve shared bottom navigation/menu experience, make oversized tables scroll within viewport, and fix Limits page provider display after verifying whether fault sits in API data, provider naming, filtering, or UI mapping.

## Source Brief Summary

Brief path: `<pidex-root>/agents.output/planning/dashboard-mobile-design-limits-brief.md`.

Required outcomes:
- Preserve `/live`, `/overview`, `/analysis`, `/limits`, current root routes.
- Preserve API paths/contracts.
- Use shared header/menu components. No duplicate page-level nav.
- Keep glass visual style while improving mobile usability.
- Produce validation commands plus mobile browser/screenshot evidence where feasible.

## Roadmap Alignment

Roadmap source missing: `<pidex-root>/agents.output/roadmap/product-roadmap.md` not found. Target release remains TBD. Plan still aligns with product objective implied by dashboard: make operational metrics usable and accurate.

## Scope and Constraints

| Area | In scope | Out of scope / forbidden |
|---|---|---|
| Repo scope | `<pidex-root>/dashboard` product files and dashboard-local artifacts | Other pidex repos/directories |
| Routes | Preserve root routes and dashboard redirect routes | Rename/remove `/live`, `/overview`, `/analysis`, `/limits`, aliases |
| API | Preserve `/api/provider-limits` path and response/request contract | Breaking contract, auth changes, new API path unless additive alias already exists |
| Visual style | Improve glass mobile design, spacing, menu affordance | Replace brand/style system wholesale |
| Navigation | Shared `GlobalHeader` / `MobileMenuSheet` only | Duplicate page-level nav, route-specific mobile menu |
| Tables | Add reusable overflow strategy and route rollouts | Convert data tables to non-semantic div grids without documented exception |
| Limits data | Diagnose and fix Codex/Codex Spark visibility if real data exists | Invent fake limits or hard-code provider values |
| Dependencies | No new package expected | Third-party install without registry check |

## Assumptions

- Dashboard base URL remains `http://pi.lan:18777/dashboard`; root pages also accessible by path such as `/live` per brief.
- Existing server reads provider limit state from parent PIDEX state path via `lib/server/limits.ts`.
- Codex/Codex Spark records, if present, should surface from real state/API payload, not fixture fabrication.
- `motion` dependency already exists and may be used; no package install required.
- CSS/global component changes should follow SOLID/DRY/KISS: shared primitives/classes over repeated inline overflow fixes; YAGNI: no new layout framework.

## Open Questions

None blocking. Roadmap release unknown due missing roadmap; plan records `Target Release: TBD`.

## Architecture and Contract Notes

- Root shell remains `routes/__root.tsx` mounting `GlobalHeader`, `Outlet`, `MobileMenuSheet`.
- Public nav source remains `NAV_LINKS` in `components/navigation/global-nav.tsx`.
- Limits API path remains `/api/provider-limits`; payload should continue exposing `profiles`, `active_profile`, `recommended_profile`, `limits`, and server-side `records` where currently present.
- POST profile behavior remains compatible: `profile`/`name` inputs accepted; existing errors unchanged unless security requires safer message while preserving semantics.
- Historical filtering semantics must be verified before change. Current code filters with `shouldIncludeHistorical(record.provider, includeHistorical)`. Provider naming mismatch may hide `codex-spark` if filter does not recognize it.
- No route security contract required because plan forbids API route/contract changes. If implementer changes outward API behavior, stop and re-plan.

## UI Intent Boundary

### Must Preserve
- Existing root route URLs and dashboard redirect aliases.
- Shared header/menu mounting in root route.
- Glass/cyber visual language, dark theme, current dashboard title and route labels unless active-state text requires aria-only additions.
- Semantic tables for tabular data.

### May Change
- Mobile bottom menu shape, width, safe-area spacing, animation.
- Mobile sheet spacing, item layout, active state, close behavior polish.
- CSS classes and wrappers for overflow containment.
- Limits display mapping/normalization where contract-compatible.

### Forbidden Changes
- Duplicated nav in individual route pages.
- Body/page horizontal scrolling as overflow workaround.
- Fake Codex/Codex Spark rows when API/state lacks real data.
- Breaking API paths, route paths, request/response contract.

### Source-of-Truth Screens / Files
- `components/navigation/global-nav.tsx`
- `app/styles/theme.css`
- `routes/__root.tsx`
- `routes/limits.tsx`
- Table routes: `routes/runs.tsx`, `routes/live.tsx`, `routes/tokens.tsx`, `routes/pipelines.tsx`, `routes/analysis.tsx`

## Existing UI Parity Contract

| Existing behavior/layout | Keep/change? | New mapping | Evidence needed |
|---|---|---|---|
| Desktop header nav | KEEP | Desktop nav remains in shared header at >= desktop breakpoint | Desktop screenshot/browser smoke |
| Mobile menu trigger fixed bottom | CHANGE | Full-width or full-width bar-style solid square/rect control, safe-area aware | Mobile screenshot closed state |
| Mobile sheet overlay | ADAPT | One item per row, active page state, animated open/close, focus trap/return | Mobile screenshot open state + keyboard evidence |
| Glass cards/tables | KEEP | Same visual language with viewport containment | Mobile screenshots no page overflow |
| Limits table | ADAPT | Same semantic data table, scroll container, corrected provider rows | API + browser evidence |

## Designer Meeting / Temporary Preview

| Field | Value |
|---|---|
| UI-heavy detected | yes |
| User requested designer meeting | no |
| Temporary preview required | conditional — preview before G4 mandatory |
| Preview artifact/path/URL | `http://pi.lan:18777/dashboard` plus route URLs |
| Reason | Shared mobile nav/table UX changes visible across product |

## Files Likely to Change

| File | Expected purpose | Slice |
|---|---|---|
| `lib/server/limits.ts` | Normalize/filter provider records so Codex/Codex Spark real records appear | S1 |
| `routes/api/provider-limits.tsx` | Diagnostic-only or minimal compatible query handling if needed | S1 |
| `routes/api/provider_limits.tsx` | Alias parity check only; avoid change unless shared helper requires | S1 |
| `routes/limits.tsx` | Limits UI mapping, empty/error copy, table wrapper/class use | S1/S4 |
| `components/navigation/global-nav.tsx` | Active nav state, mobile sheet structure/behavior | S2 |
| `app/styles/theme.css` | Mobile bar/sheet, overflow, responsive table classes | S2/S3/S4 |
| `routes/runs.tsx` | Table wrapper rollout if route overflows | S3 |
| `routes/live.tsx` | Multiple table wrapper rollout if route overflows | S3 |
| `routes/tokens.tsx` | Table wrapper consistency if route overflows | S3 |
| `routes/pipelines.tsx` | Confirm/align table wrapper class | S3 |
| `routes/analysis.tsx` | Table wrapper rollout if route overflows | S3 |
| `tests/dashboard-copy-and-interactions.test.mjs` | Existing interaction/copy assertions updated only as needed | S5 |

## Plan

### S1 — Limits tracer bullet: verify data source, fix real Codex/Codex Spark path

Objective: Prove one end-to-end path from state/API to `/limits` displays real provider records.

Likely files: `lib/server/limits.ts`, `routes/limits.tsx`, maybe `routes/api/provider-limits.tsx`.

Tasks:
1. Inspect live/state data shape at `STATE_FILE` and runtime GET `/api/provider-limits` with and without historical flag.
2. Compare raw provider names to filter allowlist and UI keying.
3. Fix smallest compatible layer: API data reading, provider normalization, filtering, or UI mapping.
4. Ensure Codex and Codex Spark appear only when real records exist in state/API payload.
5. Preserve existing payload fields and POST profile behavior.

Acceptance criteria:
- GET `/api/provider-limits` still returns existing top-level fields.
- `/limits` shows real Codex/Codex Spark data when records exist.
- No fake rows when records absent.
- Provider row keys remain unique enough for duplicate windows/limits.

### S2 — Shared mobile nav and menu sheet redesign

Objective: Improve mobile nav once in shared components, not per route.

Likely files: `components/navigation/global-nav.tsx`, `app/styles/theme.css`.

Tasks:
1. Make mobile trigger always visible on mobile root pages and use square/solid full-width or full-width bottom bar style.
2. Keep safe-area spacing and prevent trigger from blocking page content.
3. Rework sheet with one nav item per row and active/current page state.
4. Keep Escape, overlay close, close button, route-change close, focus containment, and focus return.
5. Add smooth open/close animation with reduced-motion support.

Acceptance criteria:
- Mobile trigger visible on every route mounted by root shell.
- Active route clear in sheet and desktop/mobile nav where appropriate.
- Touch target >= 44px for trigger and menu rows.
- No duplicate nav per page.

### S3 — Global overflow/table containment rollout

Objective: Stop mobile viewport widening from tables and long content.

Likely files: `app/styles/theme.css`, `routes/runs.tsx`, `routes/live.tsx`.

Tasks:
1. Define shared table overflow class/pattern in CSS.
2. Apply to highest-risk routes first: `live` multiple tables, `runs` table.
3. Verify body/page width stays within mobile viewport while tables scroll horizontally inside containers.
4. Preserve semantic `<table>` markup.

Acceptance criteria:
- No body-level horizontal scrolling at 375px viewport on touched routes.
- Tables remain horizontally pannable within container.
- Desktop table layout remains readable.

### S4 — Remaining route polish and Limits table consistency

Objective: Complete overflow rollout and Limits mobile presentation.

Likely files: `routes/tokens.tsx`, `routes/pipelines.tsx`, `routes/analysis.tsx`, `routes/limits.tsx`.

Tasks:
1. Apply same table overflow class to remaining table routes needing it.
2. Replace ad hoc inline overflow wrappers where practical with shared pattern.
3. Ensure profile select/action row wraps on mobile without overflow.
4. Keep empty/loading/error states readable inside viewport.

Acceptance criteria:
- `/analysis`, `/tokens`, `/pipelines`, `/limits` do not widen mobile viewport.
- Limits profile controls wrap/stack on mobile and remain operable.
- Empty/error/loading states remain visible and not hidden behind bottom menu.

### S5 — Validation artifact updates and version check

Objective: Update dashboard-local tests/artifacts only where product behavior changed and capture evidence.

Likely files: `tests/dashboard-copy-and-interactions.test.mjs`, `package.json` only if release process requires version bump.

Tasks:
1. Update existing dashboard interaction/copy assertions only if selectors/copy intentionally change.
2. Run validation commands from this plan.
3. Capture mobile screenshots/browser evidence into ignored project-local artifact dir.
4. Decide version bump: package currently `0.1.0`; bump only if release policy demands release artifact change.

Acceptance criteria:
- Existing validation suite passes after intentional assertion updates.
- Screenshot/browser evidence saved or documented as infeasible with reason.
- Version unchanged unless release artifact owner requests bump.

## Limits Data Investigation

Implementer must answer these before selecting fix layer:

| Check | Question | Evidence |
|---|---|---|
| L1 API data | Does raw `state/provider-limits/latest.json` contain Codex/Codex Spark records? | Redacted shape/count/provider names, no secrets |
| L2 API response | Does GET `/api/provider-limits` include those records by default? | Curl/browser JSON summary |
| L3 Historical flag | Does `show_historical=true` change inclusion? | Compare provider counts/names |
| L4 Provider naming | Are records named `codex`, `openai-codex`, `codex-spark`, `gpt-*-codex`, or other? | Provider normalization table |
| L5 Filtering | Does `shouldIncludeHistorical` exclude valid Codex Spark naming? | Before/after predicate result summary |
| L6 UI mapping | Does `/limits` map `limits` vs `records`, row keys, or display fields incorrectly? | Browser evidence on `/limits` |

If L1 shows no real records, do not fake data. Surface honest empty/fallback state and route to user/analyst if upstream data generation must be fixed outside dashboard.

## Mobile Overflow and Table Scroll Strategy

- Body remains `overflow-x: hidden` as guard, not primary solution.
- Page shell uses viewport-safe width and bottom padding for fixed mobile bar.
- Tables use semantic table markup inside dedicated horizontal scroll container.
- Scroll container owns horizontal pan; page body must not exceed viewport width.
- Long cells may wrap or truncate by column class as needed; provider/status fields stay readable.
- Inline `style={{ overflowX: 'auto' }}` may be replaced with shared class for DRY consistency.

## Shared Global Header/Menu Constraints

- `NAV_LINKS` remains single route-label source.
- Active state derives from TanStack location/path, not hard-coded per page.
- Mobile sheet row labels match existing route labels: Overview, Runs, Tokens, Pipelines, Quality, Analysis, Live, Limits.
- Sheet close behaviors: close button, overlay click, Escape, route navigation.
- Focus behavior: initial focus in sheet, tab containment while open, return focus to trigger when closed.
- Reduced-motion users get minimal/no animation.

## UI Quality Contract

### Mobile UI Contract

| Surface | Viewport | Layout behavior | Interaction/touch behavior | Keyboard/overlay/safe-area behavior | Evidence |
|---|---|---|---|---|---|
| Bottom menu trigger | 375×812 | Full-width or full-width bar-style, fixed bottom, solid/square/rect, no viewport overflow | >=44px height, easy tap | Safe-area bottom respected; content padding prevents block | Mobile closed screenshots all representative routes |
| Mobile sheet | 375×812 | Bottom sheet, one item per row, active route visible | Row tap navigates/closes | Escape/overlay/close button; focus trap/return; reduced motion | Mobile open screenshot + keyboard smoke |
| Tables | 375×812 | Container scrolls horizontally; body does not | Horizontal pan inside table area | Bottom bar does not hide final rows/actions | Mobile screenshots + viewport width check |
| Profile controls | 375×812 | Select/button wrap or stack | Select/apply tappable | Keyboard focus visible; error visible | `/limits` mobile screenshot |

### Accessibility Baseline

| Surface/control | Label/name | Keyboard/focus expectation | Status/error announcement | Contrast/touch target expectation | Evidence |
|---|---|---|---|---|---|
| Mobile menu trigger | Accessible name opens navigation | Tab reachable; focus visible | `aria-expanded` accurate | WCAG AA target; >=44px | Browser/a11y evidence |
| Mobile sheet dialog | Labelled by sheet heading | Focus enters, traps, Escape closes, returns | Active route marked via aria/current state | Row targets >=44px; contrast maintained | Browser/a11y evidence |
| Limits profile form | Label remains associated to select | Select and Apply keyboard operable | Error message visible near form | Controls readable/tappable | Browser/a11y evidence |
| Tables | `aria-label` preserved | Tab order not trapped by scroll wrappers | Empty/error states readable | Text contrast preserved | Browser evidence |

### Screenshot Matrix

Artifact directory: `<pidex-root>/dashboard/.playwright/` or equivalent ignored project-local Playwright output. Do not store screenshots in `agents.output/`.

| Screenshot ID | Surface/route | Viewport | State | Required evidence | Owner |
|---|---|---|---|---|---|
| SS-1 | `/overview` | 375×812 | menu closed | Bottom bar visible, no horizontal overflow | QA/UAT |
| SS-2 | `/overview` | 375×812 | menu open | Sheet rows one per line, active state | QA/UAT |
| SS-3 | `/live` | 375×812 | loaded | Tables contained, page width stable | QA/UAT |
| SS-4 | `/analysis` | 375×812 | loaded | Tables contained | QA/UAT |
| SS-5 | `/limits` | 375×812 | loaded with available data | Codex/Codex Spark visible if API has records; table scroll works | QA/UAT |
| SS-6 | `/limits` | 375×812 | empty/error if applicable | Honest fallback, no fake rows | QA/UAT |
| SS-7 | `/limits` | 1280×720 | loaded | Desktop not regressed | QA/UAT |

## Table UI Checklist

| Item | Decision |
|---|---|
| Column names/count | Preserve existing route table columns unless required for Limits data correctness |
| Min/max widths | Use shared CSS; avoid page-wide min-width on parent shells |
| Wrap/truncation behavior | Long text wraps/truncates inside table cells; horizontal scroll for dense columns |
| Horizontal/vertical overflow | Horizontal scroll container per table; vertical page scroll normal |
| Mobile scroll/pan proof | Required at 375×812 for table routes |
| Empty/loading/error states | Preserve and keep viewport-contained |
| Action column behavior | No new actions expected |
| Density/readability target | Mobile readable with pan; desktop current density preserved |
| Semantic markup primitive | real `<table>` currently; preserve |
| No div-grid substitute | yes — div-grid substitute forbidden unless re-plan |
| Existing shared primitive inventory | `app/styles/theme.css` class inventory checked; no dedicated table component found |
| Derived/count/filter truth matrix | Limits rows source: API `limits`/`records`; positive = real Codex/Codex Spark records; negative = absent records produce no fake rows |

## Validation

**Gate G9**: required — mobile navigation, CSS layout, table overflow, and visible Limits data binding change.

Validation commands from `<pidex-root>/dashboard`:

| ID | Command / evidence | Purpose |
|---|---|---|
| V1 | `node --test tests/dashboard-copy-and-interactions.test.mjs` | Existing dashboard interaction/copy guard |
| V2 | `npm run typecheck` | TS contract/static safety |
| V3 | `npm run build` | Production build/hydration safety |
| V4 | `./start.sh --no-build` | Local runtime server at expected port |
| V5 | `curl -s http://pi.lan:18777/dashboard/api/provider-limits` and root-relative equivalent if needed | API payload contract + provider record summary |
| V6 | Browser-level smoke at desktop 1280×720 + mobile 375×812/400×800 | 0 console errors, theme applied, no invisible overlay coverage |
| V7 | Mobile viewport width check on `/overview`, `/live`, `/analysis`, `/limits` | `document.documentElement.scrollWidth <= window.innerWidth` or documented exception only for table inner scroller |
| V8 | Screenshot matrix SS-1..SS-7 | Visual proof before UAT/G9 |
| V9 | Fallow run or `FALLOW-SKIP` rationale | JS/TS structural signal for review/QA/security |

Browser-Level Smoke acceptance row: At representative routes desktop 1280×720 plus mobile 400×800, verify 0 console errors, body background/theme non-empty, CSS tokens present where applicable, and `document.elementFromPoint(center)` not blocked by invisible overlay.

## Browser Evidence and Screenshot Expectations

- Prefer Playwright if available. If `playwright-cli` unavailable, use system Chromium/manual browser evidence and document limitation.
- Required mobile routes: `/overview`, `/live`, `/analysis`, `/limits`.
- Required menu states: closed and open.
- Required Limits evidence: API provider summary plus screenshot proving real records displayed when API contains records.
- Record browser console status and viewport dimensions with evidence.

## Fallow/FALLOW-SKIP Requirement

JS/TS scope expected. Code-review/security/QA must run one Fallow structural signal when available, or record explicit `FALLOW-SKIP: <reason>` if tool unavailable/non-applicable. Fallow finding does not replace human review.

## User Preview Requirement

| Field | Value |
|---|---|
| UI involved | yes |
| Preview required before G4 | yes |
| Preview command | `cd <pidex-root>/dashboard && ./start.sh --no-build` after build |
| Preview URL/port | `http://pi.lan:18777/dashboard` plus root pages such as `/live`, `/analysis`, `/limits` |
| Routes/screens to inspect | `/overview`, `/live`, `/analysis`, `/limits`; mobile menu open/closed; Limits data |
| Mobile viewport needed | yes — 375×812 or phone browser |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Codex Spark data absent upstream | Dashboard cannot show real records | Do not fake. Document L1 evidence and route to analyst/user for upstream fix |
| Provider naming inconsistent | Valid records filtered out | Normalize/filter compatible names; preserve raw provider display if useful |
| Fixed bottom bar blocks controls | Mobile unusable | Safe-area + page bottom padding + screenshot proof |
| Overlay intercepts page after close | Navigation broken | Browser smoke elementFromPoint/console checks |
| CSS changes regress desktop | Desktop screenshots/build/browser smoke |
| Too many tables for one pass | Missed overflow route | S3/S4 route checklist; complexity-first ordering |

## Engineering Standards

- SOLID: shared navigation/table styling responsibilities stay centralized.
- DRY: one overflow class/pattern reused; avoid per-route CSS duplication.
- YAGNI: no new framework/package; no fake data layer.
- KISS: smallest data-path fix after investigation; preserve contracts.
- Maintainability: route labels and active state derive from shared source.
- Performance: CSS/layout changes should not add heavy runtime observers.
- Security: no secrets in evidence; state/API diagnostics redact sensitive values.

## Handoff Notes

- Start with S1 because data correctness determines Limits UI truth.
- Then shared nav shell; all pages inherit mobile menu improvement.
- Then table overflow rollout from most problematic routes to remaining routes.
- If implementation needs API contract change, stop and route to architect/user; current plan forbids it.
- No unresolved open questions remain.

## Routing

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-critic
reason: Implementation-ready plan complete; no unresolved open questions.
context_file: <pidex-root>/agents.output/planning/dashboard-mobile-design-limits-plan.md
-->
