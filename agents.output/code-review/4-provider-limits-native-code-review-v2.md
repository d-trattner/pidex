---
ID: 4
Origin: 4
UUID: 70d50d80
Status: Approved
---

# Code Review: Provider Limits Native v2

## Plan Reference
`agents.output/planning/4-provider-limits-native-plan.md` (ID 4 / UUID 70d50d80)

## Implementation Reference
`agents.output/implementation/4-provider-limits-native-implementation-fix1.md`

## Date
2026-05-12

## Reviewer
pidex-code-reviewer

## TDD Compliance Check
Implementation fix TDD table present. Rows complete. Both fix rows include test-first, failure evidence, pass-after-impl.

Spot-check: tests now assert behavior, not only mock/absence:
- `scripts/provider-limits/test_probe_tdd.py:16-47` seeds PIDEX-local `state/provider-limits/native-records.json`, asserts active profile/profile list, no `recommended_profile`, exact `codex` + `codex-spark` providers.
- `dashboard/lib/server/limits.tdd.test.mjs:13-39` seeds latest state, asserts active profile, records array, exact provider pass-through.

## Overview
Second-pass review only. Prior MAJOR-1 and MINOR-1 resolved. Probe now has explicit PIDEX-local native source contract at `state/provider-limits/native-records.json`; `latest_snapshot()` falls back to it when `latest.json` records missing/invalid/empty. Tests prove codex/codex-spark pass-through and profile preservation.

## Files Reviewed

| File | Purpose | Reviewed |
|---|---|---|
| `scripts/provider-limits/probe.py` | native-record source fallback | Yes |
| `scripts/provider-limits/test_probe_tdd.py` | probe fallback contract test | Yes |
| `dashboard/lib/server/limits.tdd.test.mjs` | server seeded payload contract test | Yes |
| `dashboard/lib/server/limits.ts` | records normalization path spot-check | Yes |

## Findings

### Critical
None.

### Major
None.

### Minor
None.

## Prior Finding Resolution

| Prior finding | Status | Evidence |
|---|---|---|
| MAJOR-1 — Probe lacks native provider-limit collection/source | Resolved | `probe.py:42-66` reads PIDEX-local `state/provider-limits/native-records.json` and uses it when `latest.json` records absent/invalid/empty. Test seeds same contract and asserts exact provider rows. |
| MINOR-1 — Tests prove only recommendation absence | Resolved | Probe/server tests now assert `records`, `active_profile`, profiles, exact `codex` and `codex-spark` providers. |

## Positive Observations
- Fix remains small. No new dependency. No `/home/daniel/running-pi` coupling found in reviewed files.
- Existing empty `state/provider-limits/latest.json` stays valid; native source absent means stable empty records, per plan risk mitigation.
- Source contract sufficient for review scope: explicit PIDEX-local JSON record feed plus fixture-backed proof.

## UI Pattern Parity Review
N/A for fix diff. No UI file changed in fix1. Prior UI review remains applicable.

## Execution Profile Diff Guard

| Approved profile | Actual diff class | Skips affected | Verdict |
|---|---|---|---|
| `api-security` | Probe filesystem source + tests; server test only | Security/code-review/QA/UAT not skipped | Matches. Route security next. |

## Fallow Evidence
- Command: `npx fallow audit --format json --quiet --explain 2>/dev/null || true`
- Outcome: PASS_WITH_FINDINGS
- Review impact: Broad existing findings plus scoped findings in provider-limits routes/server. No new blocker for fix diff; prior scoped behavior gap resolved by tests.

## Security Scope Assessment
Security review required. Plan says pidex-security do not skip. Filesystem-backed provider-limit state and API/profile surfaces remain in overall plan scope.

## Validation Evidence
- `python3 scripts/provider-limits/test_probe_tdd.py` ✅
- `node --experimental-strip-types --test dashboard/lib/server/limits.tdd.test.mjs` ✅
- `grep recommended_profile|running-pi` in reviewed provider-limits paths: only expected `pop()` cleanup and tests; no running-pi coupling.
- `package.json` and `dashboard/package.json` remain `0.1.0`, matching plan target.

## Verdict
APPROVED

## Rationale
Fix closes prior blockers. Native PIDEX-local source contract exists and is tested. Tests now prove target provider rows and profile preservation. No new blocker found in intended diff.

## Next Action
Route to pidex-security. Security gate required by approved `api-security` execution profile.

<!-- ROUTING -->
verdict: APPROVED
route_to: pidex-security
context_file: agents.output/code-review/4-provider-limits-native-code-review-v2.md
gate: none
reason: prior MAJOR-1/MINOR-1 resolved; api-security profile requires security review
<!-- /ROUTING -->
