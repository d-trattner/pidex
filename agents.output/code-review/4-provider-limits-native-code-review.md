---
ID: 4
Origin: 4
UUID: 70d50d80
Status: Rejected
---

# Code Review: Provider Limits Native

## Plan Reference
`agents.output/planning/4-provider-limits-native-plan.md` (ID 4 / UUID 70d50d80)

## Implementation Reference
`agents.output/implementation/4-provider-limits-native-implementation.md`

## Date
2026-05-12

## Reviewer
pidex-code-reviewer

## TDD Compliance Check
Implementation TDD table present. Rows complete. Both rows claim test-first, failure verified, pass after implementation.

Concern: tests only assert absence of `recommended_profile`; they do not prove native provider records or `codex`/`codex-spark` pass-through.

## Overview
Implementation removes recommendation fields from probe/API/UI/profile surfaces. Main value path incomplete: probe does not collect native provider-limit records from any PIDEX-local source; it only reloads existing `state/provider-limits/latest.json` or writes empty `records`.

## Files Reviewed

| File | Status | Notes |
|---|---|---|
| `scripts/provider-limits/probe.py` | Reviewed | Recommendation removed; native collection missing. |
| `scripts/provider-limits/test_probe_tdd.py` | Reviewed | Absence-only test. |
| `scripts/profile/recommend.sh` | Reviewed | Active-profile output only. |
| `dashboard/lib/server/limits.ts` | Reviewed | Reads `records`; filters include codex-ish rows. |
| `dashboard/lib/server/limits.tdd.test.mjs` | Reviewed | Absence-only test. |
| `dashboard/routes/api/provider-limits.tsx` | Reviewed | Canonical API reviewed. |
| `dashboard/routes/api/provider_limits.tsx` | Reviewed | Alias API reviewed. |
| `dashboard/routes/api/provider-limits/profile.tsx` | Reviewed | Profile route recommendation removed. |
| `dashboard/routes/api/provider_limits/profile.tsx` | Reviewed | Alias profile route recommendation removed. |
| `dashboard/routes/limits.tsx` | Reviewed | Existing table keeps loading/empty/error states. |

## Findings

### Critical
None.

### Major

#### MAJOR-1 — Probe does not implement native provider-limit collection
- **File/line**: `scripts/provider-limits/probe.py:42-60`
- **Description**: `latest_snapshot()` only reads existing `state/provider-limits/latest.json`; if absent/invalid, it writes `records: []`. No PIDEX-local source discovery, parsing, or record construction exists. Plan objective requires native probe path producing records for available Codex providers and `codex`/`codex-spark` visibility when data exists.
- **Impact**: Core value can pass with empty state forever. `/limits` and API can only display rows if another process manually pre-populates state. QA cannot validate native collection path from this implementation.
- **Recommendation**: Add minimal PIDEX-local record source reader or explicit supported source contract. Add fixture/seed test proving `latest_snapshot()` emits/preserves `codex` and `codex-spark` records from that source without `/home/daniel/running-pi` coupling.

### Minor

#### MINOR-1 — TDD tests prove only recommendation absence
- **File/line**: `scripts/provider-limits/test_probe_tdd.py:14-16`, `dashboard/lib/server/limits.tdd.test.mjs:4-8`
- **Description**: Tests assert `recommended_profile` absent only. They do not assert `records` shape, active profile, profile preservation, or codex/codex-spark pass-through when state/source contains rows.
- **Impact**: Regression could hide target rows while tests stay green.
- **Recommendation**: Add fixture-backed assertions for `records` array and exact provider IDs when state contains `codex` + `codex-spark`.

## Positive Observations
- Recommendation field removed from active probe/API/profile/UI surfaces.
- Profile JSON files remain valid and present.
- API filter keeps `codex-spark` because provider string contains `codex`.
- Profile buttons preserve disabled active state and busy label.

## UI Pattern Parity Review

| Surface | Source pattern checked | Target files checked | Parity result | Findings |
|---|---|---|---|---|
| `/limits` existing table/status UI | Plan UI Quality Contract matrix | `dashboard/routes/limits.tsx` | Partial pass | Table, loading, empty, error states present; recommendation copy absent. Missing native rows due probe finding. |

## Execution Profile Diff Guard

| Approved profile | Actual diff class | Skips affected | Verdict |
|---|---|---|---|
| `api-security` | Product code: probe filesystem state, API routes, UI route, tests | Security/code-review/QA/UAT not skipped | Profile matches. Rejection due implementation gap, not profile drift. |

## Fallow Evidence
- Command: `npx fallow audit --format json --quiet --explain 2>/dev/null || true`
- Outcome: PASS_WITH_FINDINGS
- Review impact: Existing broad findings plus scoped moderate findings on `dashboard/routes/limits.tsx`, `dashboard/routes/api/provider-limits.tsx`, `dashboard/routes/api/provider_limits.tsx`, `dashboard/lib/server/limits.ts`. Not separate blocker beyond missing core behavior/tests.

## Security Scope Assessment
Security review still required after fixes. API routes, POST profile mutation, and filesystem-backed state touched. Plan profile explicitly says pidex-security do not skip.

## Validation Evidence
- `python3 scripts/provider-limits/test_probe_tdd.py` ✅
- `node --experimental-strip-types --test dashboard/lib/server/limits.tdd.test.mjs` ✅
- `grep recommended_profile` in `scripts/` + `dashboard/` found only removal code/tests plus historical dashboard QA artifact.
- `grep running-pi` in intended provider-limits files found no new coupling.
- `package.json` and `dashboard/package.json` remain `0.1.0`, matching plan target.

## Verdict
REJECTED

## Rationale
Core native collection path missing. Recommendation cleanup good, but plan value requires provider records from PIDEX-native source path, not only existing-state echo.

## Next Action
pidex-implementer: implement minimal native record source/fixture contract and strengthen tests for `records`, `codex`, and `codex-spark` pass-through. Then rerun code review.

<!-- ROUTING -->
verdict: REJECTED
route_to: pidex-implementer
context_file: agents.output/code-review/4-provider-limits-native-code-review.md
gate: none
reason: probe only echoes existing latest.json or empty records; native provider-limit record collection and codex/codex-spark proof missing
<!-- /ROUTING -->
