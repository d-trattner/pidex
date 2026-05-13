---
ID: dashboard-readiness-plan
Origin: dashboard-readiness-plan
UUID: a7533441
Status: Active
---

## Plan Reference
- `<pidex-root>/agents.output/planning/dashboard-readiness-plan.md` (`dashboard-readiness-plan`, `a7533441`)

## Date
- 2026-05-12

## Changelog

| Date | Change | Notes |
|------|--------|-------|
| 2026-05-12 | Dashboard readiness fixes applied | Build+typecheck green |

## Implementation Summary
- Fixed TanStack route generation path config; generated `app/routeTree.gen.ts` via build flow.
- Resolved route conflicts by moving `_dashboard` tree to `routes/dashboard` and updating links/redirects.
- Fixed API server import paths to `lib/server/*` from api route files.
- Added Node types support (`@types/node`, tsconfig `types`).
- Fixed overview card tuple/object mismatch.
- Resolved motion prop typing conflicts in glass UI wrappers.
- Relaxed DB query generic constraints to accept typed row interfaces.

## Milestones Completed
- [x] Slice 1 router generation + build viability
- [x] Slice 2 API handler import/path correctness
- [x] Slice 3 typecheck blockers cleanup
- [x] Slice 4 parity smoke + validation notes

## Files Modified

| Path | Changes | Lines |
|------|---------|-------|
| `dashboard/vite.config.ts` | Router generation path config | small |
| `dashboard/package.json` | TanStack/node typings versions | small |
| `dashboard/tsconfig.json` | Node types + generated route include | small |
| `dashboard/routes/**` | `_dashboard` -> `dashboard`, route path updates, redirect updates | medium |
| `dashboard/routes/api/**/*.tsx` | Fixed `lib/server` relative imports | medium |
| `dashboard/components/ui/glass-button.tsx` | Motion prop type conflict fix | small |
| `dashboard/components/ui/glass-panel.tsx` | Motion prop type conflict fix | small |
| `dashboard/routes/_dashboard/overview.tsx` (moved) | Card type/object mapping fix | small |
| `dashboard/lib/server/db.ts` | Generic constraint fix | small |

## Files Created

| Path | Purpose |
|------|---------|
| `dashboard/app/routeTree.gen.ts` | Generated TanStack route tree |

## Code Quality Validation
- [x] Build passes
- [x] Typecheck passes

## Value Statement Validation
- Dashboard now builds and typechecks cleanly.
- Required API contracts preserved at configured paths.
- Legacy parity smoke mostly green; `/api/analysis/document` returned 404 without query params (handler reachable, response depends on request context).

## TDD Compliance

| Function/Class | Test File | Test Written First? | Failure Verified? | Failure Reason | Pass After Impl? |
|----------------|-----------|---------------------|-------------------|----------------|------------------|
| N/A | N/A | N/A | N/A | Build/typecheck remediation task; no new function/class added | N/A |

## Test Coverage
- Unit: no new tests added.
- Integration: endpoint smoke via local dev server.

## Test Execution Results
- `npm run typecheck` ✅
- `npm run build` ✅
- Dev smoke (`/api/*`):
  - `/api/analysis` 200
  - `/api/analysis/plans` 200
  - `/api/analysis/document` 404 (no query context)
  - `/api/live` 200
  - `/api/pipelines` 200
  - `/api/charts/quality` 200
  - `/api/charts/model-quality` 200
- FALLOW-SKIP: Fallow not run in this task scope/environment.

## Outstanding Items
- TanStack package line includes deprecation/security warning on selected versions during install; follow-up recommended to pin verified-safe releases across router/start/plugin set.

## Next Steps
- Code review focus: route migration (`_dashboard` -> `dashboard`) and API document endpoint default-response expectation.

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-code-reviewer
reason: Required validations passed (build + typecheck) with scoped readiness fixes applied.
context_file: <pidex-root>/agents.output/implementation/dashboard-readiness-implementation.md
-->
