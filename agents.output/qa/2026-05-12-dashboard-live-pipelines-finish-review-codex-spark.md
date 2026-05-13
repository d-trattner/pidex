---
title: Dashboard Live/Pipelines finish review (codex-spark)
date: 2026-05-12
status: PASS
scope: <pidex-root>/dashboard/routes/_dashboard/{live,pipelines} and <pidex-root>/dashboard/lib/server/api.ts
---

# Dashboard Live/Pipelines Finish Review (codex-spark)

## Verdict
PASS

## Summary
Implemented remaining fixups for the migrated dashboard pages:
- `dashboard/routes/_dashboard/live.tsx`
  - Fixed `unresolvedValue` fallback to reference `unresolved_inferred` instead of unrelated `pending_gate`.
  - Removed redundant `JsonRecord` cast in recent secondary timestamp rendering.
- `dashboard/routes/_dashboard/pipelines.tsx`
  - Made table row keys collision-resistant by including row index.
- `dashboard/lib/server/api.ts`
  - Expanded `getLiveState()` to return legacy-compatible fields:
    - `open_pipelines`
    - `latest_by_agent`
    - `recent_secondary`
    - richer `latest_runs`
    - `summary` values (`open_pipelines`, `running_pipelines`, `unresolved_inferred`, `pending_gate`, etc.)

## Checks Performed
- Static inspection of updated payload-shape adapters and `getLiveState()` query outputs.
- Confirmed fallback paths in `live.tsx` now have first-class payload support from API.
- Confirmed no blocking throw/path regressions introduced in touched UI adapters.

## Remaining Notes
- Dashboard-wide TypeScript/typecheck in this branch still has baseline environment/schema issues unrelated to this slice (existing across many files in `dashboard/`).
- No functional blockers introduced by this slice.

<!-- ROUTING
verdict: PASS
route_to: orchestrator
context_file: <pidex-root>/agents.output/qa/2026-05-12-dashboard-live-pipelines-finish-review-codex-spark.md
-->
