# PIDEX Dashboard Readiness Brief

Project cwd: `<pidex-root>/dashboard`
PIDEX repo: `<pidex-root>`
Legacy reference: `<pidex-root>/dashboard-old`

User task: Review the PIDEX dashboard in `<pidex-root>/dashboard`. Check install/readiness, TanStack dashboard build/type issues, API parity with `dashboard-old`, and propose/implement the smallest fixes needed to make the dashboard production-ready. Do not change unrelated files.

Known recent checks:
- `cd <pidex-root> && npm run check` passes.
- `cd <pidex-root> && ./install.sh` succeeds.
- `cd <pidex-root>/dashboard && npm run build` fails: router generator scans `<pidex-root>/dashboard/app/routes`, missing `routeTree.gen`, cannot resolve `./routeTree.gen` from `app/router.tsx`.
- `npm run typecheck` has many dashboard errors including missing route tree, missing Node types, bad relative imports in API routes (`../lib/server/...`), motion prop type conflicts, overview tuple/object mismatch.

Current scope boundaries:
- May modify only dashboard production-readiness files under `<pidex-root>/dashboard` unless a tiny PIDEX doc/script update is required for install command correctness.
- Do not change unrelated pidex package/runtime files.
- Keep API route contracts unchanged: `/api/analysis`, `/api/analysis/plans`, `/api/analysis/document`, `/api/live`, `/api/pipelines`, `/api/charts/quality`, `/api/charts/model-quality`.
- Prefer smallest fix set to make dashboard build/typecheck pass and preserve parity with legacy `dashboard-old/scripts/server.py` + `dashboard-old/public/index.html`.

Pre-spawn context pack note: required `<pidex-root>/scripts/pre-spawn/spawn-with-budget.sh` is absent in this checkout, so this brief is the compact context pack substitute.

Expected planner output: implementation-ready plan at `<pidex-root>/agents.output/planning/dashboard-readiness-plan.md`, with exact files, validation commands, and routing.

ROUTING requirements: final block must include `context_file: <pidex-root>/agents.output/planning/dashboard-readiness-plan.md`.
