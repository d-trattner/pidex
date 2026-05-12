---
ID: 4
Origin: 4
UUID: 5098e241
Status: APPROVED_WITH_COMMENTS
---

# Dashboard Parity Mobile Projects Design Contract

## Plan Reference
- Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
- Brief: `agents.output/briefs/4-dashboard-parity-mobile-projects-designer-brief.md`
- Findings: `agents.output/analysis/4-dashboard-parity-mobile-projects-findings.md`
- Critic: `agents.output/critic/4-dashboard-parity-mobile-projects-critique-v2.md`
- ID: 4 / UUID: `5098e241`

## Date
2026-05-12

## Design Variance Parameters
| Parameter | Value | Note |
|---|---:|---|
| DESIGN_VARIANCE | 4 | Preserve-mostly. No redesign. |
| MOTION_INTENSITY | 3 | Existing sheet/pill motion only. |
| VISUAL_DENSITY | 6 | Operational dashboard density preserved desktop; mobile readability first. |

## Must-Fix Before Commit
- [MUST-FIX] Project selector: desktop control in global header near nav; mobile control inside menu/sheet before route list; label includes current scope; `All projects` option present; target height >= 44px.
- [MUST-FIX] Quality mobile layout: at `375×812`, every top-level Quality chart/card article spans full row; no three-column squeezed chart; no body horizontal scroll.
- [MUST-FIX] Token pagination: weekly and monthly cards each show Older/Newer controls with disabled states from `has_older`/`has_newer`; buttons >= 44px; labels identify grain or context.
- [MUST-FIX] Mobile sheet focus: opening selector/nav preserves dialog focus trap, Escape close, overlay close, and focus return to trigger.

## UI Scope Summary
- Global project scope: add URL-backed selector. Preserve header/nav hierarchy. No second page-level filter bar.
- Mobile nav/sheet: selector available in same flow as navigation. Existing bottom trigger/sheet geometry preserved.
- Quality route: stack cards on mobile; desktop multi-column density stays. Add approved diagnostics only.
- Tokens route: add weekly/monthly historical pagination. Keep table/card visual language.
- Data routes: visible selected scope must be reflected consistently across Overview, Runs, Pipelines, Quality/model-quality, Tokens, Live.

## Preserve-Mostly Contract
- Keep current dark glass identity: cyan line, translucent panels, restrained glow, Recharts palette.
- Keep TanStack route IA and labels.
- Keep desktop dashboard density.
- Do not recreate old dashboard visuals.
- Do not add centered hero, marketing card grid, gradient text, purple/neon excess, custom cursor, pure black fields.
- Capability parity, not visual port.

## Design Token Specifications
Use `agents.output/design/DESIGN.md` tokens.
- Background: `#03060d`, gradient near-black `#01030a` OK; no `#000`.
- Panel: `rgba(3, 8, 20, 0.84)` / `rgba(8, 18, 33, 0.78)`.
- Text: `#d7fff7`; muted `#6ee7e0`; dim `#7aa4b0`.
- Line: `rgba(34, 255, 225, 0.24)`.
- Accent: cyan `#00f5ff`; warning `#ffe600`; error `#ff3864`; success `#00ff85`.
- Radius: cards 16px; controls 8-10px except existing pill nav.
- Spacing: 12px grid gap, 18px panel padding, mobile shell side margin target 16px.
- Typography: existing Inter/system stack; body 16px/1.45; headings 20-28px, 600-700.

## Component Specs
### Project Scope Selector
- Placement desktop: global header right-side/nav cluster. Visually sibling to nav pills, not page title replacement.
- Placement mobile: inside mobile sheet below sheet head and above nav list. If header has compact visible affordance, it must not compete with fixed bottom Menu.
- Copy: label `Project`; default option `All projects`; selected project shown verbatim but clipped/truncated gracefully.
- Shape: glass input/select/combobox, 1px cyan line, 8-10px radius, compact desktop width, full-width mobile.
- State: all-project default shown when query absent/empty. Changing project updates URL and route data; token page resets to newest window.

### Quality Mobile Cards
- Top-level Quality articles full-width below 900px or equivalent mobile breakpoint.
- Desktop: current 12-column card rhythm stays; hero/intro full-width remains acceptable.
- Inner metric tiles in Quality summary also stack or wrap cleanly on mobile; no 3px/quarter-width mini cards.
- Chart height: keep around 220px minimum on mobile. Axis labels may rotate/truncate; chart must remain legible.
- Added diagnostics:
  - Gate friction: table or bar card; title `Gate friction`; show gates/failures by pipeline.
  - Malformed trend: line/bar card; title `Malformed routing trend`.
  - G9 events/rejections: dual-line or compact table; title `G9 events`.
  - Merge dispositions/classifications: separate compact cards or one split card; title names explicit.

### Token Pagination Controls
- Weekly and monthly sections/cards visible as distinct blocks.
- Header/meta line shows range: start/end or month window.
- Controls live near range text or card footer; not detached at page bottom.
- Order: Older left, Newer right, or mirrored only if existing dashboard convention proves otherwise. Disabled Newer common on page 0.
- Empty history: show muted empty copy plus disabled controls where metadata says no navigation.

### Route Scope Indicator
- Pages affected by selector should show visible scope only once: selector value enough if header visible. Optional muted line in page intro allowed if ambiguity remains.
- Avoid repeated `Project:` badges in every card.

## Interaction States
| Component | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Project selector | Control disabled or shows loading text if project list pending; no layout jump | `All projects` only if no projects | Keep route usable; muted error copy, do not leak query/raw backend error | Selected scope visible; URL matches |
| Mobile sheet selector | Same as selector; focus remains inside sheet | Same as selector | Error copy inside sheet or fallback all-project; close still works | Select closes only if native behavior expects it; route data updates |
| Quality cards | Existing full-width loading card/card skeleton acceptable | Per-card muted `No data available yet` copy | Existing error banner/card; keep safe fallback view | Charts/tables loaded, full-width mobile |
| Tokens weekly/monthly | Section-level loading copy; controls disabled while loading | `No weekly/monthly rows` plus disabled nav if no history | Muted error card; no raw API detail | Range, rows, controls reflect metadata |
| Pagination buttons | Disabled while page fetch pending | Disabled if no history | Re-enable valid controls after failure; error copy near section | URL/data page updates without jumping focus unexpectedly |

## Accessibility Checklist
- WCAG 2.2 AA contrast minimum for selector, buttons, disabled states, chart labels where meaningful.
- 44×44px minimum touch target for selector, sheet close, Older/Newer, mobile nav rows.
- Project selector has accessible name: `Project scope` or equivalent.
- Options include `All projects` with clear value semantics.
- Token buttons named with context: `Older week`, `Newer week`, `Older month`, `Newer month` or adjacent labelled region that removes ambiguity.
- Disabled controls use semantic disabled/aria-disabled as appropriate, not color only.
- Focus order: mobile Menu trigger → Close/selector/nav; no trap escape except close/Escape.
- Focus visible cyan outline/ring remains on all new controls.
- Charts paired with table or text summary where data table exists; empty/error text screen-reader readable.

## Screenshot Audit Requirement
Post-implementation designer audit required before QA/UAT.

Required evidence:
| ID | Surface | Viewport | State |
|---|---|---|---|
| SM-1 | `/quality` | `375×812` | Loaded all projects; one card per row |
| SM-2 | `/quality` | `1280×720` | Desktop grid preserved |
| SM-3 | Mobile nav/sheet | `375×812` | Sheet open; project selector visible; focusable controls |
| SM-4 | Overview or other scoped route | `1280×720` | Selected project; URL query visible |
| SM-5 | `/tokens` weekly | `1280×720` | Page 0 and older page if data exists |
| SM-6 | `/tokens` monthly | `1280×720` | Page 0 and older page if data exists |
| SM-7 | `/tokens` pagination | `375×812` | Controls readable/tappable; no horizontal clipping |

Store screenshots only under `.playwright/`.

## AI-Slop Check
Pass with constraints.
- No new visual identity.
- No marketing-card grid.
- No centered hero.
- No gradient text.
- No oversaturated glow.
- No fake metrics; diagnostics must use real API fields or empty states.
- No duplicate nav/filter bars.

## Findings
### Critical
None.

### Medium
- Project selector placement/state/accessibility underspecified for implementation. Must-fix bullets define contract.
- Mobile Quality grid risk known from current `.glass-card span 4`; must enforce full-row mobile.
- Token controls need explicit disabled/label/touch behavior; must-fix bullets define contract.
- Mobile sheet focus can regress when adding selector; must preserve existing dialog cycle.

### Low
- Current theme uses Inter; acceptable because existing system already uses it. Do not expand typography work.
- Added Quality cards may clutter route. Keep approved subset only and prefer compact titles/copy.

## Verdict
APPROVED_WITH_COMMENTS. Implementer may proceed. Must-fix bullets are commit contract. Post-implementation designer audit required before QA/UAT.

<!-- ROUTING -->
verdict: APPROVED_WITH_COMMENTS
route_to: pidex-implementer
context_file: agents.output/design/4-dashboard-parity-mobile-projects-design.md
gate: none
reason: Preserve-mostly design contract approved with concrete must-fix UI/accessibility requirements
<!-- /ROUTING -->
