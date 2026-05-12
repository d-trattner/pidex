# Design System

## Changelog
| Date | Change | Rationale | Plan |
|------|--------|-----------|------|
| 2026-05-12 | Bootstrapped dashboard design system from current theme + mobile limits guidance | DESIGN.md absent; UI-heavy plan needs source of truth | dashboard-mobile-design-limits-plan |
| 2026-05-12 | Added preserve-mostly dashboard parity patterns: project scope selector, token pagination, Quality mobile stack | Plan restores old capability while keeping current glass/TanStack identity | 4-dashboard-parity-mobile-projects-plan |

## Design Principles
- Operational glass, not arcade neon. Dark cyan/pink accents stay restrained.
- Mobile first for navigation and dense data. Page body never owns horizontal overflow.
- Semantic data stays semantic. Tables remain tables; scroll wrapper handles width.
- Accessibility equal visual spec. 44px targets, visible focus, WCAG AA.

## Color Palette
### Primary / Secondary / Neutral / Semantic
- Background: `#03060d`; page gradient may use near-black `#01030a`, never pure `#000`.
- Panel: `rgba(3, 8, 20, 0.84)` and `rgba(8, 18, 33, 0.78)`.
- Text: `#d7fff7`; dim text `#7aa4b0`; muted/accent copy `#6ee7e0`.
- Line: `rgba(34, 255, 225, 0.24)`; subtle table line `rgba(34, 255, 225, 0.14)`.
- Accent cyan: `#00f5ff`; use for active/primary emphasis, not large glowing fields.
- Accent pink: `#ff2bd6`; use sparingly only as secondary energy.
- Success `#00ff85`; warning `#ffe600`; error `#ff3864`.

## Typography
### Font Stack / Scale / Weights / Line Heights
- Font stack: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif.
- Body: 16px base, 1.45 line-height.
- Small/status: 12.5-14px, 1.35 line-height.
- Page/card heading: 20-28px responsive, 600-700 weight.
- Metric value: 22-37px responsive, 700 weight, slight tracking.

## Spacing
### Base Unit / Scale
- Base: 4px.
- Scale: 4, 8, 12, 16, 18, 24, 32, 48, 64.
- Mobile page shell: 16px side margin target; bottom padding must clear fixed menu + safe area.

## Layout
### Grid / Breakpoints / Container Widths
- Max shell width: 1300px desktop; mobile width constrained to viewport minus side gutters.
- Desktop breakpoint: 900px for full nav vs mobile menu.
- Mobile dense tables: contained horizontal scroll; document/page scroll remains vertical only.

## Components
### Buttons / Inputs / Cards / Navigation / Tables
- Glass panels: 1px cyan line, dark translucent gradient, backdrop blur, restrained glow.
- Cards: 16px radius unless table/navigation surface calls for squarer control.
- Buttons: 44px minimum target. Default radius 10px; mobile bottom menu uses squarer 4-8px radius, not pill.
- Mobile bottom menu: full-width bottom control within safe-area margins; solid glass fill; label visible.
- Mobile sheet: bottom dialog, 16px top radius, max 80vh, internal vertical scroll.
- Mobile sheet nav: one destination per row, 48-56px height, active route clearly marked.
- Project scope selector: compact glass control near desktop nav; in mobile sheet below title and before route list. Label current scope. `All projects` default. 44px minimum target. Do not create second page-level filter bar.
- Token pagination: Older/Newer controls live inside relevant weekly/monthly card header or footer. Buttons use existing glass button treatment, disabled state visibly dim plus semantic disabled. Labels include time grain when ambiguity exists.
- Quality diagnostic cards: preserve current Recharts/card style. Mobile stacks one article per row; desktop keeps current multi-column density. Added diagnostics use short operational titles, muted explanatory copy, no marketing metrics.
- Tables: semantic table inside glass scroll region; sticky/fade edge optional if subtle.

## Motion
### Timing / Easing / Transitions
- Default transitions: 160-220ms ease-out.
- Mobile sheet: overlay fade 120-160ms; sheet translate/opacity 180-240ms ease-out.
- Reduced motion: no translate animation; instant/fade-only state change.

## Iconography
### Style / Size / Source
- Minimal line icons only if already present. Avoid decorative icon grids.
- Icon target area counts toward 44px minimum; icon alone needs accessible label.

## Accessibility
### Minimum Standards / Touch Targets / Contrast / Focus Indicators
- WCAG 2.2 AA minimum.
- Touch targets: 44x44px minimum; mobile nav rows preferred 48px+ high.
- Focus: visible cyan outline/ring with offset on all interactive controls.
- Dialogs: labelled, modal semantics, focus trap, Escape close, focus return.
- Selectors: accessible name identifies scope; native select or equivalent combobox semantics required.
- Pagination: button names expose grain and direction; unavailable history state announced via disabled semantics, not color only.
- Active route: visible state plus current-page semantic state.

## Anti-Patterns
### Rejected patterns and why
- No centered hero redesign for operational dashboard.
- No 3-column marketing card rows as mobile solution.
- No gradient text.
- No oversaturated glows or pure black fields.
- No duplicate page-level navigation.
- No body-level horizontal scroll as table workaround.
