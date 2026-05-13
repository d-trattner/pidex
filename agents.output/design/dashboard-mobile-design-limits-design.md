---
ID: dashboard-mobile-design-limits-plan
Origin: dashboard-mobile-design-limits-brief
UUID: eec388ea
Status: OPEN
---

# Mobile Design Limits Review

## Plan reference
- Path: `<pidex-root>/agents.output/planning/dashboard-mobile-design-limits-plan.md`
- ID: `dashboard-mobile-design-limits-plan`
- UUID: `eec388ea`
- Critic: `<pidex-root>/agents.output/review/dashboard-mobile-design-limits-critic.md`

## Date
- 2026-05-12

## Design Variance Parameters
- DESIGN_VARIANCE: 5
- MOTION_INTENSITY: 4
- VISUAL_DENSITY: 6

## UI Scope Summary
- Mobile bottom menu trigger: redesign from centered pill to full-width square/rect control.
- Mobile navigation sheet: one destination per row, active route, complete dialog behavior.
- Dense tables/overflow: keep glass style; scroll inside table region, not page body.
- Limits page: display real provider data clearly; data diagnosis remains implementer task.
- Existing glass/cyber dashboard identity preserved. No product files modified.

## Design Token Specifications
- Use DESIGN.md tokens. New source written: `<pidex-root>/agents.output/design/DESIGN.md`.
- Bottom trigger fill: dark glass panel using current panel gradient, 1px cyan line, no pill radius.
- Bottom trigger text: `#d7fff7`, 16px, 600 weight. Secondary hint optional in `#6ee7e0`, 12-13px.
- Active route: cyan line/fill accent; text remains high contrast. Avoid pink as main active state.
- Table scroll surface: same panel fill, 1px line, subtle inset/edge fade only. No heavy glow.
- Focus: visible cyan outline/ring with offset; must stand out on glass.

## Component Specs

### Mobile bottom full-width square button
- Position: fixed bottom, above `env(safe-area-inset-bottom)`.
- Width: viewport width minus 24px total gutter at 375px; never overflow viewport.
- Height: 56px preferred, 48px minimum.
- Shape: square/rect language. Radius 4-8px. Not capsule/pill.
- Placement: 12px side gutter, 12-16px bottom visual gap plus safe area.
- Visual: solid glass-dark fill; 1px cyan border; optional 1px top highlight; no floating neon blob.
- Label: visible “Menu”. Optional current section text allowed if compact.
- State:
  - Default: calm glass, readable text.
  - Pressed: slight darken + 1px translate max.
  - Focus: strong cyan ring/outline.
  - Open: `aria-expanded=true`; visual active border/fill.
- Page content: bottom padding clears button height + safe area + 16px breathing room.

### Mobile sheet layout
- Presentation: bottom sheet dialog over dim overlay.
- Width: full viewport width. Max width not needed on mobile; no side overflow.
- Height: content-based up to 80vh; internal vertical scroll when needed.
- Shape: top corners 16px; bottom corners 0 to anchor to viewport.
- Header row: “Navigation” title left, Close button right, 44px target.
- Nav list: one item per row. No wrapping pill cloud.
- Row size: 52-56px height preferred, 48px minimum; full row tappable.
- Row content: label left. Optional subtle route/status glyph right; no decorative icon grid.
- Active row: visible left cyan rail or border + darker selected fill + current-page semantic state. Text contrast AA.
- Overlay: dark translucent, not pure black; tap outside closes.
- Scrolling: sheet content scrolls; background page not interactable while open.

### Mobile overflow / table scroll
- Each dense table sits in glass scroll region constrained to page width.
- Page shell remains viewport-safe; body horizontal scroll must be absent.
- Horizontal pan belongs to table container only.
- Preserve semantic `<table>` structure and existing column meaning.
- Table min width allowed inside scroll container; parent cards/forms cannot impose viewport overflow.
- Glass preservation:
  - Outer scroll container carries glass border/background.
  - Table keeps subtle row dividers.
  - Edge fade/scroll shadow may indicate more columns, but keep low opacity.
- Long cells:
  - Provider/status labels stay readable.
  - IDs/paths may wrap, truncate, or horizontally scroll by column behavior.
- Desktop: current density preserved; no unnecessary card conversion.

### Limits page data display expectations
- Display Codex and Codex Spark only from real API/state records.
- If records exist, show provider names in readable rows/cards/table entries with stable unique keys.
- If records absent, show honest empty/fallback state. No fake rows, no hard-coded values.
- Profile controls stack or wrap on mobile; select/apply remain 44px targets.
- Error/empty/loading copy sits above table region or inside glass panel, never hidden behind bottom button.
- Data diagnosis, provider normalization, and API/state proof remain implementer responsibility per plan L1-L6.

## Interaction States
- Bottom trigger loading: not expected. If route loading, trigger remains enabled unless sheet subsystem failed.
- Bottom trigger empty nav fallback: opens sheet with “No destinations available” + Close.
- Bottom trigger error: open sheet still closable; show inline nav error, no crash.
- Sheet default: focus enters Close or first nav row; active route marked.
- Sheet open/close animation: overlay fades 120-160ms; sheet translates up/fades 180-240ms ease-out.
- Reduced motion: no translate; instant or fade-only.
- Sheet close paths: Close, overlay tap, Escape, route navigation.
- Tables loading: keep container width stable; skeleton/text inside panel, no layout jump.
- Tables empty: message inside glass region with no horizontal overflow.
- Tables error: readable message + retry/action if existing product pattern has one.
- Limits success: real rows visible; Codex/Codex Spark appear only if API contains them.

## Accessibility Checklist
- Bottom trigger accessible name includes “Menu” or “Open navigation”.
- Bottom trigger exposes dialog relationship and expanded state.
- All bottom trigger and sheet controls meet 44x44px minimum.
- Sheet uses labelled modal dialog semantics.
- Focus trapped while sheet open; Escape closes; focus returns to trigger.
- Active nav row exposes current page semantic state.
- Overlay close must not be only close path; visible Close button required.
- Reduced motion honored.
- Text and active/focus states meet WCAG 2.2 AA contrast on glass.
- Table scroll containers do not trap keyboard users; focus order remains logical.
- Limits empty/error/loading states announced/readable through normal DOM text.

## Screenshot Audit Requirement
- Required. UI-heavy plan.
- Post-implementation designer audit required before QA/UAT if visual implementation differs from this spec or evidence incomplete.
- Required captures/evidence:
  - `/overview` 375x812 menu closed: full-width square bottom control, no page overflow.
  - `/overview` 375x812 sheet open: one row per item, active state visible.
  - `/live` 375x812 loaded: table scroll contained.
  - `/analysis` 375x812 loaded: table scroll contained.
  - `/limits` 375x812 loaded/empty/error as applicable: controls usable, bottom button not blocking.
  - `/limits` 1280x720 loaded: desktop not regressed.
  - Keyboard proof: open, Tab/Shift+Tab cycle, Escape close, focus return.

## AI-Slop Check
- Pass. Spec rejects pill-cloud mobile nav, centered hero patterns, card-grid substitute, gradient text, oversaturated glows, custom cursor, pure black overlay, fake metrics.
- Watch item: current palette has strong neon cyan/pink. Use restrained accents only; no extra glow layer.

## Findings
### Critical
- None.

### Medium
- None.

### Low
- DESIGN.md was absent. Bootstrapped current dashboard tokens for this plan.
- Process rules files under `<pidex-root>/rules/pidex-designer/` unavailable in this runtime; followed embedded role rules.
- Critic low note L2 addressed by screenshot/evidence expectations and interaction states above.

## Verdict
APPROVED

<!-- ROUTING
verdict: APPROVED
route_to: pidex-implementer
reason: Mobile visual specs complete for bottom trigger, sheet, overflow tables, and Limits display expectations.
context_file: <pidex-root>/agents.output/design/dashboard-mobile-design-limits-design.md
-->
