# Rule: Browser-Level Smoke Obligation (UI Plans)

PROC-NEW (UI-smoke) | pidex-planner

## Rule

If plan modifies ANY of:
- `apps/*/src/components/**`, `src/ui/**` (components)
- `apps/*/src/routes/**` beyond static JSON endpoints (routes with UI)
- `apps/*/src/styles/**`, root `*.css` (theme/tokens/global CSS)
- `__root.tsx`, `client.tsx`, `server.tsx` (hydration-critical)
- `vite.config.*`, `next.config.*` (build-level behavior)

...plan MUST name **Playwright-based Browser-Level Smoke** as dedicated acceptance-criteria row under "Runtime Smoke". Do NOT let pidex-qa default to curl-only for UI work.

## Minimum AC shape

```
| AC-browser-smoke | At representative routes (desktop 1280×720 + mobile 400×800):
|                  |  - 0 console errors
|                  |  - body bg is NOT rgba(0,0,0,0) (theme applied)
|                  |  - `getPropertyValue('--color-bg-0')` non-empty
|                  |  - `document.elementFromPoint(center)` returns expected
|                  |    interactive element (no invisible-overlay coverage)
|                  | Verified via Playwright MCP in pidex-qa Phase 2. |
```

pidex-critic MUST flag UI plans omitting this row. Post-hydration counterpart to curl-based smoke — complementary, not redundant.

## Empirical basis

Plan 17 B.1.a (2026-04-21): UI plan with 6 slices + responsive Shell + Sheet drawer, curl-based smoke only. Passed QA. Rejected at G9 four times: FOUC-reverse (hydration mismatch on inline `<style>`), drawer-covered-by-overlay (z-index inversion), theme tokens dropped on re-render. None detectable without Playwright. Would have been caught in QA with Browser-Level Smoke.
