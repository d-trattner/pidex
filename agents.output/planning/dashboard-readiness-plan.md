---
ID: dashboard-readiness-plan
Origin: dashboard-readiness-plan
UUID: a7533441
Status: Code Review Approved
Target Release: v0.1.0
Epic: PIDEX Dashboard Production Readiness
---

## Changelog
- 2026-05-12: Drafted production-readiness plan from compact context pack.
- 2026-05-12: Code review approved (pidex-code-reviewer); routed to pidex-security.

## Value Statement and Business Objective
As PIDEX operator, I want dashboard build + typecheck + API handlers stable with legacy parity, so deployment works without breaking existing dashboard data views.

## Objective Summary
1. Unblock TanStack Start/router generated route tree failures.
2. Remove dashboard typecheck blockers with smallest safe edits.
3. Correct API route import/path/server-handler wiring.
4. Preserve legacy API contract/path parity used by old UI.

## Scope and Constraints
- In-scope: `<pidex-root>/dashboard` only, except minimal doc/script note if strictly required.
- Preserve API contracts:
  - `/api/analysis`
  - `/api/analysis/plans`
  - `/api/analysis/document`
  - `/api/live`
  - `/api/pipelines`
  - `/api/charts/quality`
  - `/api/charts/model-quality`
- Smallest change set. No unrelated refactors.
- No implementation code in this plan.

## Inputs Reviewed
1. `<pidex-root>/agents.output/planning/dashboard-readiness-brief.md`
2. `dashboard/package.json`, `dashboard/vite.config.ts`, `dashboard/app/router.tsx`, `dashboard/tsconfig.json`
3. Current `npm run typecheck` failure log (dashboard)
4. Legacy parity references: `dashboard-old/scripts/server.py`, `dashboard-old/public/index.html`

## Assumptions
1. Existing dashboard has valid TanStack Start scaffolding; failures from missing generation/wiring, not missing framework install.
2. Legacy `dashboard-old/scripts/server.py` is parity source-of-truth for response shape/path behavior.
3. Target release can be next patch delivery for dashboard package (`v0.1.0` placeholder; confirm against roadmap/version policy).

## Open Questions
- OPEN QUESTION [RESOLVED]: Release tag aligns package version `dashboard/package.json`=`0.1.0`; plan targets `v0.1.0` readiness patch.
- OPEN QUESTION [CLOSED]: Rule-file path lookup failed in runtime sandbox; compact context pack treated authoritative for this run.

## Plan (Vertical Slices)
### Slice 1 (Tracer Bullet): Router generation + build viability
Objective: Make one full build path succeed with generated route tree resolution.
Acceptance Criteria:
1. `npm run build` from dashboard no longer fails on `routeTree.gen` import/scan issue.
2. Route tree generation step deterministic in local + CI invocation.
3. No API path/contract changes.
Dependencies: dashboard router config, route directory mapping.
Owner: pidex-implementer.

### Slice 2: API handler import/path correctness
Objective: Fix server route modules with broken relative imports / handler bindings.
Acceptance Criteria:
1. API routes compile in typecheck/build.
2. Handler wiring resolves runtime module paths.
3. Preserved endpoint paths listed in scope.
Dependencies: server lib path map.
Owner: pidex-implementer.

### Slice 3: Typecheck blockers cleanup (minimal)
Objective: Remove remaining TS blockers (node types, motion props, overview shape mismatch) without behavior drift.
Acceptance Criteria:
1. `npm run typecheck` exits 0.
2. No contract drift for legacy-consumed data fields.
3. Changes confined to erroring files only.
Dependencies: slice 1+2 merged.
Owner: pidex-implementer.

### Slice 4: Legacy API parity verification + release prep
Objective: Confirm dashboard API responses/paths align with legacy expectations; finalize release metadata.
Acceptance Criteria:
1. Endpoint/path parity matrix completed for required routes.
2. Any intentional deltas documented with rationale.
3. Version/changelog milestone prepared.
Dependencies: slices 1-3.
Owner: pidex-implementer.

## Implementation Lanes (Micro-sliced)
Lane A — Router tree unblock (3 files max)
1. `dashboard/vite.config.ts` (TanStack router generation path alignment)
2. `dashboard/app/router.tsx` (generated tree import path confirmation)
3. `dashboard/package.json` (optional explicit route-gen script in build chain)

Lane B — API route import/server handler correctness (3 files starter lane, repeat pattern)
1. `dashboard/routes/api/analysis.tsx`
2. `dashboard/routes/api/live.tsx`
3. `dashboard/routes/api/pipelines.tsx`
Pattern then applied to sibling API files with same defect class (`../lib/server/*` bad path, invalid route API usage).

Lane C — Typecheck core blockers (3 files)
1. `dashboard/tsconfig.json` (Node type availability)
2. `dashboard/components/ui/glass-button.tsx` (motion prop typing conflict)
3. `dashboard/routes/_dashboard/overview.tsx` (tuple/object shape mismatch)

Lane D — Legacy parity + release artifact (2 files)
1. `dashboard-old/scripts/server.py` (reference-only parity source)
2. `dashboard/package.json` (version milestone confirmation; changelog artifact if present in dashboard)

## API Parity Commitments
1. Keep exact route paths unchanged for required endpoints: `/api/analysis`, `/api/analysis/plans`, `/api/analysis/document`, `/api/live`, `/api/pipelines`, `/api/charts/quality`, `/api/charts/model-quality`.
2. Keep response envelope/field names expected by `dashboard-old/public/index.html` and legacy server callers.
3. If fallback/default behavior differs from `dashboard-old/scripts/server.py`, document delta before merge.

## Validation Commands
Run from `<pidex-root>/dashboard`:
1. `npm ci`
2. `npm run build` (must generate/resolve route tree; no `./routeTree.gen` failure)
3. `npm run typecheck`
4. `npm run dev` (separate terminal) then endpoint smoke:
   - `curl -sS http://localhost:<port>/api/analysis`
   - `curl -sS http://localhost:<port>/api/analysis/plans`
   - `curl -sS http://localhost:<port>/api/analysis/document`
   - `curl -sS http://localhost:<port>/api/live`
   - `curl -sS http://localhost:<port>/api/pipelines`
   - `curl -sS http://localhost:<port>/api/charts/quality`
   - `curl -sS http://localhost:<port>/api/charts/model-quality`
5. Optional quality scripts if present: `npm run lint`, `npm run test`
6. Required gate note for JS/TS delivery: run/document Fallow gate or record `FALLOW-SKIP` with explicit reason in release evidence.

## Testing Strategy
- Unit/integration/e2e expected to run per existing dashboard scripts.
- Focus: build-time route generation, API handler resolution, response-shape parity, TS compile integrity.
- No new QA process defined in this plan.

## Risks and Mitigations
1. Risk: route generator config mismatch across dev/CI. Mitigation: single canonical generation command in build chain.
2. Risk: silent API shape drift while fixing types. Mitigation: parity matrix against legacy server + old UI expectations.
3. Risk: broad typing refactor creep. Mitigation: cap edits to blocker files only.

## User Preview Requirement
- Mandatory pre-G4 user preview remains required.
- If UI-visible behavior changes from readiness fixes, capture preview after devops deploy; QA/UAT browser evidence does not replace user preview.

## Release and Version Management Milestone
- Final milestone in Slice 4: confirm dashboard release version, update release notes/changelog artifacts impacted by readiness fix set.

## Handoff Notes
- Implement slice order strict: router viability → API wiring → TS blockers → parity/release.
- Build/typecheck baseline from current run captured in this plan; use as defect checklist.
- If parity mismatch found vs legacy endpoints, stop and document field-level delta before merge.

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-critic
reason: Plan complete, scoped smallest readiness fixes, open-question check closed.
context_file: <pidex-root>/agents.output/planning/dashboard-readiness-plan.md
-->
