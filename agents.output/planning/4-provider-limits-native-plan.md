---
ID: 4
Origin: 4
UUID: 70d50d80
Status: In Progress
Target Release: v0.1.0
Epic: PIDEX-native provider limits
---

# Provider Limits Native Plan

## Value Statement and Business Objective

As a pidex operator, I want provider-limit collection, API, and dashboard display to use PIDEX-native state, so that Codex and Codex Spark usage appears without `/home/daniel/running-pi` coupling or profile recommendation noise.

## Objective

Deliver native provider-limits path in `/home/daniel/pidex`: probe writes concrete records to `state/provider-limits/latest.json`; API returns same records; `/limits` displays `codex` and `codex-spark` rows when data exists. Preserve existing `codex-optimized` and `codex-high` profiles. Remove recommendation behavior from probe, server response, and UI surface.

## Roadmap and Release Alignment

Confirmed epic from direct-mode brief: PIDEX-native provider-limits collection. Target Release `v0.1.0` based on root and dashboard package versions; no separate roadmap file provided in compact brief.

## Execution Profile and Retro Mode

Execution Profile: `api-security`

Reason: plan changes API routes, filesystem-backed provider-limit state, server normalization, profile POST behavior, and `/limits` UI display. Security/code-review/QA/UAT remain required gates. UI scope is small table/status update inside existing screen; no designer skip unless orchestrator has existing-screen preservation policy satisfied.

Skipped-agent contract:

| Agent | Decision | Safety condition |
|---|---|---|
| pidex-analyst | Skip initially | Provider-state source already discoverable in repo or local Codex/Spark mechanisms. If source contract unknown, route to pidex-analyst with concrete missing-source question. |
| pidex-architect | Skip initially | No new architecture, storage backend, external integration, or cross-repo contract. If API/state schema impact grows beyond current provider-limits path, route to pidex-architect. |
| pidex-security | Do not skip | API + filesystem-backed state and profile mutation surface require security review. |
| pidex-code-review | Do not skip | Probe/API/UI contract changes require review. |
| pidex-qa | Do not skip | Probe → API → UI behavior and compatibility routes require QA gate. |
| pidex-uat | Do not skip | `/limits` is user-visible. User preview required before release disposition. |

Retro Mode: `mini`

Reason: focused revision touches multiple gates but no migration, multi-repo contract, or large architecture change. Post-retro handoff should record any provider-source discovery surprise, skipped-agent escalation, or preview evidence gap; otherwise close with brief lessons only.

## Context and Constraints

- Do not implement in planner phase.
- Do not touch unrelated dirty repository state. Implementer must inspect `git status --short` before edits and preserve unrelated changes.
- Avoid any dependency on `/home/daniel/running-pi`.
- Preserve `config/profiles/codex-optimized.json` and `config/profiles/codex-high.json` semantics and availability.
- Remove recommendation behavior; no `recommended_profile` guidance in probe/API/UI or profile helper surface.
- Current recommendation references also exist in profile alias routes and `scripts/profile/recommend.sh`; address or retire them so no active surface recommends profile switches.
- `codex` and `codex-spark` rows must show when available.
- Follow SOLID, DRY, YAGNI, KISS: isolated probe parsing, single server normalization path, minimal UI surface change.

## Assumptions

- Existing profile selection can remain if it represents operator-selected active profile, not recommendation.
- `state/provider-limits/latest.json` is correct persistence target.
- Provider-limit source data exists locally or can be collected by existing Codex/Codex Spark mechanisms without external project paths.

## Open Questions

None blocking from brief.

## Plan Slices

### Slice 1 — Native probe tracer bullet

Objective: Make `scripts/provider-limits/probe.py` produce PIDEX-native `latest.json` with non-recommendation schema and records for available Codex providers.

Likely files:
- `scripts/provider-limits/probe.py`
- `scripts/profile/recommend.sh` or replacement/removal path, if still part of active profile surface
- `state/provider-limits/latest.json` generated only during validation, not committed unless repo convention requires fixture state

Work package:
- Discover PIDEX-local Codex/Spark usage source without referencing `/home/daniel/running-pi` at runtime.
- If legacy behavior needs comparison, use only repository-local artifacts already present; do not call or import external checkout paths.
- Collect `codex` and `codex-spark` usage into records when source data available.
- Preserve profiles list and active profile field if currently useful.
- Remove `recommended_profile` emission and any recommendation text/decision logic.
- Ensure `latest`, `latest.json`, or timestamp fields remain internally consistent; avoid new schema fields unless needed by UI/API.
- Keep output stable, machine-readable, and tolerant of absent data.

Acceptance:
- Running probe writes `state/provider-limits/latest.json`.
- Output contains `records` array.
- When Codex usage source has data, records include provider identifiers for `codex` and `codex-spark`.
- Output has no `recommended_profile` or recommendation message/field.

### Slice 2 — API normalization and filtering

Objective: API returns probe records directly enough for dashboard and automation while removing recommendation surface.

Likely files:
- `dashboard/lib/server/limits.ts`
- `dashboard/routes/api/provider-limits.tsx`
- `dashboard/routes/api/provider-limits/profile.tsx`
- `dashboard/routes/api/provider_limits.tsx`
- `dashboard/routes/api/provider_limits/profile.tsx`

Work package:
- Update server-side reader/schema to match native probe output.
- Remove `recommended_profile` from public API contract across canonical hyphen routes and underscore compatibility aliases.
- Ensure filters include exact/expected `codex` and `codex-spark` rows when present; avoid overly broad filtering that hides Spark.
- Treat `limits` and `records` compatibility deliberately. Prefer one canonical data source, but keep aliases only if existing dashboard/API consumers require them.
- Keep POST active-profile behavior only if still supported and profile-preserving.

Acceptance:
- `GET /api/provider-limits` returns records from latest state.
- `GET /api/provider_limits` compatibility route matches canonical behavior if retained.
- Profile subroutes no longer return `recommended_profile`.
- Response includes `codex` and `codex-spark` records when present in state.
- Response excludes recommendation field/behavior.
- Active profile handling does not mutate or remove preserved profiles.

### Slice 3 — `/limits` dashboard display

Objective: `/limits` page shows native records and no recommendation UI.

Likely files:
- `dashboard/routes/limits.tsx`

Work package:
- Align loader/client types with API response.
- Display provider rows for `codex` and `codex-spark` when available.
- Remove recommendation banner/copy/CTA if present.
- Keep profile buttons only as active profile controls, not recommendations.

Acceptance:
- `/limits` displays table rows for `codex` and `codex-spark` when state has those records.
- UI has no recommendation copy or recommended-profile affordance.
- Existing profile buttons for `codex-optimized` and `codex-high` remain visible/usable if current design includes profile switching.

### Slice 4 — Validation and release artifact check

Objective: Prove probe/API/UI path works and release artifacts remain stable.

Likely files:
- package/build config only if existing commands require updates
- version/changelog files only if project release convention requires this plan to change artifacts

Work package:
- Run validation commands below.
- Confirm profiles unchanged except deliberate compatibility edits if needed.
- If release artifacts change, include version management update as final mechanical commit.

Acceptance:
- Probe, API, UI, build, typecheck, and tests pass.
- `config/profiles/codex-optimized.json` and `config/profiles/codex-high.json` still exist and remain valid JSON.
- No unrelated dirty files modified.

## Acceptance Criteria

1. Native probe writes `state/provider-limits/latest.json` from PIDEX-local sources only.
2. Probe output contains usable `records` and no recommendation fields/logic.
3. API returns records from latest state, including `codex` and `codex-spark` when data exists.
4. API/profile compatibility routes expose active profile only, not recommended profile.
5. `/limits` UI displays those rows and no recommendation surface.
6. `codex-optimized` and `codex-high` profiles remain preserved and valid.
7. Build/typecheck/tests pass.
8. Implementer avoids unrelated dirty changes.

## Validation Commands

Initial safety:

```bash
git status --short
```

Probe output:

```bash
python3 scripts/provider-limits/probe.py
python3 - <<'PY'
import json
from pathlib import Path
p = Path('state/provider-limits/latest.json')
data = json.loads(p.read_text())
assert 'records' in data and isinstance(data['records'], list)
assert 'recommended_profile' not in data
providers = {str(r.get('provider', '')) for r in data['records']}
print('providers=', sorted(providers))
PY
```

Provider-row validation when source/fixture data exists:

```bash
python3 - <<'PY'
import json
from pathlib import Path
records = json.loads(Path('state/provider-limits/latest.json').read_text()).get('records', [])
providers = {str(r.get('provider', '')) for r in records}
if records:
    assert 'codex' in providers, providers
    assert 'codex-spark' in providers, providers
print('target providers present when data available')
PY
```

API:

```bash
# Start dashboard: npm --prefix dashboard run dev
curl -fsS http://localhost:18777/api/provider-limits | python3 -m json.tool
curl -fsS http://localhost:18777/api/provider-limits | python3 - <<'PY'
import json, sys
data = json.load(sys.stdin)
assert 'recommended_profile' not in data
assert isinstance(data.get('records'), list)
providers = {str(r.get('provider', '')) for r in data['records']}
if data['records']:
    assert 'codex' in providers, providers
    assert 'codex-spark' in providers, providers
print('records=', len(data['records']))
PY
curl -fsS http://localhost:18777/api/provider_limits | python3 -m json.tool
curl -fsS http://localhost:18777/api/provider-limits/profile | python3 -m json.tool
```

UI:

```bash
# With dashboard running, open /limits and confirm visible rows for available codex and codex-spark state records; no recommendation copy appears.
# When source/fixture data exists, both provider IDs must be visible in /limits row labels or equivalent provider cells.
```

## UI Quality Contract

Screenshot matrix for `/limits` visible changes:

| State | Route | Viewport | Evidence required | Notes |
|---|---|---|---|---|
| Loaded provider rows | `/limits` | Desktop | Screenshot shows native rows, including `codex` and `codex-spark` when source/fixture data exists | Primary proof for value statement. |
| Empty records | `/limits` | Desktop | Screenshot shows stable empty state, no recommendation copy | Feasible via empty `records` fixture/state or local equivalent. |
| Loading or error state | `/limits` | Desktop | Screenshot if route exposes visible state reliably | Capture if feasible without invasive harness changes. |
| Loaded provider rows | `/limits` | Mobile | Screenshot or explicit non-applicable note | Mobile check required because page is user-visible table/status UI. |

Build/typecheck/tests:

```bash
npm run check
npm --prefix dashboard run typecheck
npm --prefix dashboard run build
npm run test --if-present
npm --prefix dashboard run test --if-present
```

If package manager differs in lockfile, use matching equivalent and document substitution.

## User Preview Requirement

UI involved. After devops/deployment step and before G4 completion, provide user preview of `/limits` with native provider-limit data visible. Browser/QA evidence does not replace user preview.

| Item | Requirement |
|---|---|
| Start command | `npm --prefix dashboard run dev` unless project scripts identify different canonical dashboard command |
| URL | `http://localhost:18777/limits` |
| Route/screen | `/limits` provider-limits dashboard |
| Data expectation | Native provider-limit records visible; `codex` and `codex-spark` visible when source/fixture data exists; no recommendation copy |
| Desktop viewport | Required |
| Mobile viewport | Required for preview or explicit not-applicable note if layout not responsive in current app |
| Timing | After devops/deployment readiness, before G4 completion |

## Version Management

No version bump assumed because target package version already `0.1.0`. If release artifacts or changelog convention exists and changes are required, handle after functional slices.

## Risks and Mitigations

- Risk: local Codex usage source absent. Mitigation: probe returns stable empty records and logs/metadata, while validation with seeded/real source proves rows when data available.
- Risk: stale API filtering hides Spark records. Mitigation: verify exact `codex` and `codex-spark` provider IDs from state through API.
- Risk: dirty repo state. Mitigation: inspect status before edits; commit only intended files.
- Risk: recommendation fields consumed elsewhere. Mitigation: grep for `recommended_profile` and remove/adjust only provider-limits consumers.

## Handoff Notes

- Start with current file inspection named in brief; do not broaden scope unless references demand it.
- Keep implementation small. Avoid abstractions beyond probe reader/normalizer needs.
- Do not add dependency on `/home/daniel/running-pi` or assume it exists.
- If provider-state contract proves unknown, route to pidex-analyst with concrete missing source question.
- Grep evidence found `recommended_profile` in probe, server limits, canonical/underscore profile routes, and `scripts/profile/recommend.sh`; remove active surfaces, ignore historical `agents.output` and `analysis` artifacts.

## Routing

<!-- ROUTING -->
verdict: COMPLETE
route_to: pidex-critic
context_file: agents.output/planning/4-provider-limits-native-plan.md
gate: none
reason: revised plan adds api-security execution profile, mini retro, user preview table, UI screenshot matrix, and codex/codex-spark assertions
<!-- /ROUTING -->
