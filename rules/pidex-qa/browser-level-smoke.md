# Rule: Browser-Level Smoke for UI Plans

PROC-NEW-QA-BROWSER-SMOKE | pidex-qa

## Trigger

Mandatory when plan modifies visible UI or hydration/build-critical frontend files:

- `apps/*/src/components/**` or `src/ui/**`
- `apps/*/src/routes/**` except static JSON-only health/ping endpoints
- `apps/*/src/styles/**` or root CSS files
- `__root.tsx`, `client.tsx`, `server.tsx`
- `vite.config.*`, `next.config.*`, `svelte.config.*` when frontend behavior/hydration may change

Backend-only API/CLI/script/database plans can skip browser smoke; curl/runtime smoke may still apply.

## Required Checks

For each representative route from plan AC/V-matrix:

1. Navigate and wait for hydration.
2. Assert zero console errors, especially hydration mismatch errors.
3. Execute the relevant user flow from the plan, not only route load.
4. Assert stylesheet present (`<link rel="stylesheet">` or non-trivial `<style>` block).
5. Assert theme tokens resolve to non-empty values when project uses CSS variables.
6. Assert body background is not transparent unless transparent is explicit design.
7. Capture screenshot evidence for each required UI state declared by the plan.
8. For data/persistence UI, reload and re-find the relevant state/data.
9. For overlay/drawer/fixed UI, verify clickable element is topmost with `document.elementFromPoint`.
10. Resize to mobile viewport (default 400×800) and repeat relevant checks.

## Record

In QA doc under `Runtime Smoke Verification > Browser-Level Smoke`, record:

- route
- viewport
- user flow executed
- console error count
- stylesheet/theme evidence
- interaction stacking evidence when applicable
- reload/persistence evidence when applicable
- screenshot/artifact path for every captured state

Hydration errors are QA blockers, not warnings.

## Completion Gate

For UI plans, QA MUST NOT emit final `QA COMPLETE` unless browser evidence is present in the QA doc.

If browser testing cannot complete because of tool budget, browser infrastructure, or dev-server constraints, use `browser-stall-fallback.md` exactly and route as `BLOCKED` for orchestrator browser evidence collection. Do not route to `pidex-uat` until browser evidence has been appended.

## Fallback

If Playwright MCP stalls or budget exhausts, use `browser-stall-fallback.md` exactly. Do not fail implementation only because browser tool budget ran out.
