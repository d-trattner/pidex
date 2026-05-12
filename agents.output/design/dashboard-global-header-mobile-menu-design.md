---
ID: 3
Origin: 3
UUID: 7c9a2d4f
Status: OPEN
---

## Plan reference
- `/home/daniel/pidex/agents.output/planning/dashboard-global-header-mobile-menu-plan.md`
- ID 3, UUID 7c9a2d4f

## Date
- 2026-05-12

## Design Variance Parameters
- DESIGN_VARIANCE: 4
- MOTION_INTENSITY: 3
- VISUAL_DENSITY: 5

## UI Scope Summary
- Shared global glass header on `/dashboard /live /overview /analysis /runs /tokens /pipelines /quality /limits`.
- Desktop: header carries nav pills. Remove per-page duplicate nav.
- Mobile: always-visible bottom Menu trigger. Opens bottom sheet with same nav list.

## Design Token Specifications
- Keep existing glass tokens from current dashboard surfaces. No new palette.
- Header/sheet use same blur, border, shadow, radius language as current dashboard top chrome.
- Divider style: 1px subtle neutral divider, not glow.
- Touch targets: min 44x44px all nav pills/buttons.

## Component Specs
- Desktop header layout:
  - Left: product/dashboard label.
  - Center-left: primary nav pills in single row, wraps never above md; horizontal scroll allowed below lg.
  - Right: utility area reserved; keep balanced spacing.
  - Height stable across routes; avoid jump.
- Mobile bottom trigger:
  - Fixed above safe-area inset, centered horizontally.
  - Label visible: “Menu”.
  - Glass pill style matching header.
- Mobile sheet:
  - Bottom-sheet modal, max height ~80vh, internal scroll.
  - Top row: title “Navigation” + close button.
  - Nav list vertical, clear active route state.
  - Tap nav item: navigate then close sheet.

## Interaction States
- Loading route state: keep header + trigger interactive; active item may show pending state.
- Empty nav state (fallback only): show “No destinations” text + close control.
- Error state (nav config failure): inline message in sheet/header area, no crash.
- Success/default: active route highlighted; sheet closed after navigation.

## Accessibility Checklist
- Trigger button:
  - `aria-label="Open menu"` (or `Menu` if visible label programmatically bound).
  - `aria-haspopup="dialog"`, `aria-controls` sheet id, `aria-expanded` true/false.
- Sheet semantics:
  - `role="dialog"`, `aria-modal="true"`, labeled by sheet title id.
  - Close button has `aria-label="Close menu"`.
- Focus behavior:
  - Open: focus moves to sheet title or first nav item.
  - Trap focus inside sheet while open.
  - Close via close button, overlay tap, ESC, successful nav.
  - Close returns focus to Menu trigger.
- Keyboard:
  - Tab/Shift+Tab cycle inside sheet.
  - Enter/Space activate controls.
- Contrast + target:
  - WCAG 2.2 AA text contrast.
  - 44px minimum target size confirmed.

## Screenshot Audit Requirement
- Required. Post-implementation designer audit required before QA/UAT.
- Required captures: SS-1..SS-4 from plan at 1280x720 and 375x812.

## AI-Slop Check
- Pass conditions:
  - No 3-column card-grid nav.
  - No neon/purple glow accents.
  - No centered hero pattern.
  - No gradient text.

## Findings
### Critical
- None.

### Medium
- None.

### Low
- Keep active-state contrast strong on glass background.

## Verdict
APPROVED

<!-- ROUTING
verdict: APPROVED
route_to: pidex-implementer
context_file: /home/daniel/pidex/agents.output/design/dashboard-global-header-mobile-menu-design.md
-->
