---
ID: slice-2026-05-11
Origin: orchestartor-plan
UUID: 8adfc5f7
Status: QA Complete
---

# QA: Dashboard Route Pages Slice (pipelines, quality, live)

## Plan Reference
Slice review for dashboard route pages: pipelines.tsx, quality.tsx, live.tsx
- File paths: `dashboard/routes/_dashboard/pipelines.tsx`, `quality.tsx`, `live.tsx`
- API endpoints: `/api/pipelines`, `/api/charts/quality`, `/api/charts/model-quality`, `/api/live`
- API implementations: `dashboard/routes/api/pipelines.tsx`, `dashboard/routes/api/charts/quality.tsx`, `dashboard/routes/api/charts/model-quality.tsx`, `dashboard/routes/api/live.tsx`
- Backend functions: `dashboard/lib/server/api.ts` — `listPipelines()`, `qualityChartData()`, `modelQuality()`, `getLiveState()`
- Legacy reference: `dashboard-old/scripts/server.py` (archived, not active)

## QA Status
QA Complete

## QA Specialist
rp-qa (deepseek)

## Changelog
| Date | Change |
|------|--------|
| 2026-05-11 | Initial QA doc created |
| 2026-05-11 | Phase 1 review complete: 3 files analyzed vs 4 endpoints + legacy |

## Timeline
| Event | Timestamp |
|-------|-----------|
| Test strategy started | 2026-05-11 |
| Implementation received | 2026-05-11 |
| Testing started | 2026-05-11 |
| Testing completed | 2026-05-11 |
| Final status | QA Complete |

## Test Strategy (Pre-Implementation)

### Scope
Three route page components validated against four API endpoints. Two API backends exist:
1. **New TS backend** (primary, TanStack Start SSR) — `api.ts` routes
2. **Legacy Python backend** (archived, `dashboard-old`) for parity reference

### Validation Focus
1. API endpoint usage and payload compatibility
2. Loading/error handling and defensive rendering
3. TS/runtime issues
4. Parity risks vs legacy dashboard-old

### Methodology
Static code review — trace data flow from API response through type parsing to render. Compare TS backend output shapes against frontend type expectations. Compare legacy Python output shapes against same.

### Architecture Assessment
- New TS backend `api.ts` was ported from legacy Python with some refactoring
- Frontend pages were written for TanStack Start with defensive fallbacks supporting both API shapes
- `dashboard-old` README explicitly marks it as archived legacy

## Implementation Review (Post-Implementation)

### Code Changes (Summary)
- **pipelines.tsx** (4.3KB): Single-table page fetching `/api/pipelines`. Straightforward render with loading/error states.
- **quality.tsx** (15KB): Multi-chart page (Area, Line, Bar, Pie via Recharts) fetching 2 endpoints. Heavy defensive parsing.
- **live.tsx** (16KB): Heavy multi-table page (6 tables) with fallback adapters for both API payload shapes. AbortController for cleanup.

### TDD Compliance Gate
No test files exist for any of the 3 route components. No unit tests, no integration tests, no browser-level smoke tests.
- `dashboard/__tests__/` does not exist
- `dashboard/**/*.test.*` does not exist
- Zero test coverage for these components

**Note**: This is a code-review slice (not a full implementation plan), so TDD compliance table expectation is lower. However, the absence of any test coverage is a gap for production-readiness.

## Test Coverage Analysis

### Coverage Gaps
| Component | Tests | Risk |
|-----------|-------|------|
| pipelines.tsx | 0 | Low — simple fetch+table |
| quality.tsx | 0 | Medium — 2 API fetches, 4 chart types, complex error handling |
| live.tsx | 0 | High — 6 data sections, fallback adapters for 2 API shapes, 6 helper functions |

### API Parity (New TS vs Legacy Python)
| Endpoint | TS Backend | Legacy Python | Frontend Supports Both? |
|----------|-----------|---------------|------------------------|
| `/api/pipelines` | ✅ Same SQL, same shape | ✅ Same SQL | N/A (same query) |
| `/api/charts/quality` | ✅ Same shape + additional fields (`analystVerdicts`, `qualityImpactByDay`, `infraMarkers`) | ✅ Same base shape | ✅ via defensive `pickArray` |
| `/api/charts/model-quality` | ✅ Same aggregation logic | ✅ Same logic | ✅ via defensive parsing |
| `/api/live` | ⚠️ **Different shape** — no `open_pipelines`, `latest_by_agent`, `recent_secondary` fields | ✅ Full payload | ⚠️ Via fallback adapters w/ data loss |

## Test Execution Results

Static code review only (no runtime tests available). 3 source files analyzed against 4 API endpoint implementations + 1 legacy reference implementation.

### Status: No automated tests executed
- No test runner configured in `dashboard/`
- No Playwright/nightwatch/cypress tests discovered
- Manual verification of data flow traces completed

## Issues Found

### 🔴 CRITICAL: live.tsx — Legacy parity gap in TS API backend

**File**: `dashboard/lib/server/api.ts:getLiveState()` (line 643)
**Description**: TS backend's `getLiveState()` returns only `{generated_at, status_counts, running_agents, running_pipelines: [{project, count}], recent, pending_gate}`. Missing vs legacy Python:
- `open_pipelines` — legacy returns detailed rows with `project, plan_key, pipeline_id, started_at, last_at, event_type, status, source, agent_runs, distinct_agents, failures, last_agent, age_ms`
- `latest_by_agent` — legacy returns per-agent latest rows with `timestamp, project, plan_key, agent, provider, model, verdict, route_to, gate, duration_ms, context_file`
- `recent_secondary` — legacy returns secondary artifact rows
- `summary.running_pipelines`, `summary.unresolved_inferred`, `summary.pending_gate` — legacy has a summary sub-object

**Impact**: Frontend fallback adapters (`toOpenPipelines`, `toLatestByAgent`, `toRecentSecondary`) handle missing data but with significant degradation:
- `openPipelines` fallback: maps `running_pipelines[{project, count}]` but **loses `plan_key`, `pipeline_id`, `started_at`, `last_at`, `event_type`, `distinct_agents`, `failures`, `last_agent`** — all show as `'—'`
- `latestByAgent` fallback: falls back to `latest_runs` slice (10 rows max) — loses the "latest per agent" semantics
- `recentSecondary` fallback: returns empty `[]` always (ts API has no `recent_secondary`)

**Recommendation**: Backfill TS `getLiveState()` to include `open_pipelines`, `latest_by_agent`, `recent_secondary` for full parity, or drop optional-format columns from frontend tables when TS API is active.

### 🟠 MAJOR: live.tsx — `unresolvedValue` fallback logic error

**File**: `dashboard/routes/_dashboard/live.tsx:232`
```tsx
const unresolvedValue = toNumber(unresolvedInferred)
  ?? (Array.isArray(payload?.pending_gate) ? 0 : null);
```
**Issue**: Fallback checks `payload?.pending_gate` (unrelated field) instead of `unresolvedInferred`. Should be:
```
?? (Array.isArray(unresolvedInferred) ? 0 : null)
```
or simply treat `null` as fallback.

**Impact**: When both `summary.unresolved_inferred` and `payload.unresolved_inferred` are `undefined`/missing (which is the TS API case), `unresolvedValue` becomes `null` → renders `'—'`. This is actually the correct display behavior by accident, but the logic is misleading.

**Recommendation**: Fix to check `unresolvedInferred` directly, or simplify to `toNumber(unresolvedInferred) ?? null`.

### 🟡 MINOR: pipelines.tsx — Table key collision risk

**File**: `dashboard/routes/_dashboard/pipelines.tsx:69`
```tsx
<tr key={`${row.completed_at}-${row.project}-${row.plan_key}`}>
```
**Issue**: If two pipelines complete at same second with same project+plan_key (same pipeline row), React will see duplicate keys and log warnings. Low probability but possible with rapid sequential runs.

**Recommendation**: Append row index or use `completed_at-project-plan_key-agent_runs` as key.

### 🟡 MINOR: live.tsx — Redundant type cast in secondary table

**File**: `dashboard/routes/_dashboard/live.tsx:302`
```tsx
<td>{toDateText((row as JsonRecord).mtime ?? row.mtime)}</td>
```
**Issue**: `(row as JsonRecord).mtime ?? row.mtime` is a no-op — both access `row.mtime`. The type cast to `JsonRecord` is unnecessary and masks potential type errors.

**Recommendation**: Simplify to `toDateText(row.mtime)`.

### 🟢 INFO: quality.tsx — Defensive parsing is thorough

**File**: `dashboard/routes/_dashboard/quality.tsx`
**Observation**: `safeNumber()`, `pickArray()`, all field fallbacks to empty arrays, `hasApiIssue` catch for unexpected API response shapes — strong defensive design. No issues found here.

### 🟡 MINOR: No test infrastructure exists

No test files, no test runner config, no smoke tests found for any of the 3 route components. Production-readiness requires at minimum basic smoke/accessibility tests for live.tsx given its complexity.

## Final Assessment

### PASS with Conditions ✅

| Criterion | Verdict | Notes |
|-----------|---------|-------|
| API endpoint usage | ✅ PASS | All 4 endpoints exist, typed correctly |
| Payload compatibility | ✅ PASS | Defensive fallbacks handle both TS and legacy Python shapes |
| Loading/error handling | ✅ PASS | All 3 pages have loading/error states with cleanup |
| TS/runtime issues | ⚠️ MINOR | 3 minor items (key collision, type cast, misleading fallback) |
| Legacy parity | ⚠️ MAJOR | live.tsx loses 3 data sections when served by TS backend |
| Test coverage | ❌ GAP | Zero tests across all components |

### Action Items

1. **Address CRITICAL**: Backfill `getLiveState()` with `open_pipelines`, `latest_by_agent`, `recent_secondary` for TS API parity — OR remove optional columns from live.tsx tables when TS API is active and those fields won't populate
2. **Address MAJOR**: Fix `unresolvedValue` fallback to check `unresolvedInferred` instead of `payload?.pending_gate`
3. **Address MINOR**: Fix table key collision risk in pipelines.tsx (append index), remove redundant type cast in live.tsx
4. **Address GAP**: Create test infrastructure — at minimum, integration tests for live.tsx's fallback adapters (`toOpenPipelines`, `toLatestByAgent`, `toLatestRuns`, `toRecentSecondary`)

### Risk Assessment
- **pipelines.tsx**: LOW — simple data flow, well-typed
- **quality.tsx**: LOW — thorough defensive parsing, simple data flow
- **live.tsx**: MEDIUM — complex fallback logic, 6 data sections, missing API fields cause user-visible data gaps in 3 tables (open_pipelines plan_key, latest_by_agent, recent_secondary columns all display `'—'`)

## Handoff Note

Ready for rp-uat or returning to implementer for the CRITICAL/MAJOR fixes. The TS API live endpoint should be extended or frontend live.tsx should detect which API is serving it and conditionally render only available sections.

<!-- ROUTING
verdict: COMPLETE
route_to: orchestrator
reason: QA complete — PASS with conditions. 1 CRITICAL (live.tsx TS API lacks 3 data sections vs legacy), 1 MAJOR (misleading fallback check), 3 MINOR, 0 tests. Action items listed.
gate: none
context_file: /home/daniel/pidex/agents.output/qa/pipelines-quality-live-review-deepseek.md
-->
