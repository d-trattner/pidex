---
ID: 024
Origin: 024
UUID: 1ee1f134
Status: Active
Target Release: v0.24.0
Epic: Initiative 024 Browser Smoke QA Substrate
---

## Plan Header and Changelog
- Plan ID: 024
- Target Release: v0.24.0
- Epic Alignment: 024 Browser Smoke QA Substrate
- Status: Active
- Changelog: Initial implementation plan draft.

## Value Statement and Business Objective
As PIDEX operator, I want optional safe browser-smoke substrate with deterministic statuses, so QA can collect browser evidence without surprise installs, runaway processes, or hidden infra risk.

## User Approval Gate
User approval implicit via direct task: produce implementation plan for initiative 024.

## Objective and Context Summary
1. Add first-party browser-smoke capability under PIDEX module system.
2. Keep feature optional, explicit, cross-platform (Linux + Windows).
3. Enforce adopted QA safety rules: no immortal test servers, generated script syntax check.
4. Preserve no-surprise install behavior and no project mutation default.

## Assumptions and Constraints
- Browser smoke not PIDEX core mandatory dependency.
- First-party internal module path: `modules/pidex/browser-smoke/`.
- Runtime support path: `state/browser-smoke/`.
- Heavy cache path: `.cache/ms-playwright/` or `.cache/browser-smoke/`.
- No npm-global Playwright default.
- Non-interactive install: never prompt, never silent browser download.
- Installer calls module capability; no duplicated setup logic.

## Release Lane Semantics
| Field | Value |
|---|---|
| Product epic label | Initiative 024 Browser Smoke QA Substrate |
| Current package semver | none declared in initiative context |
| Intended package target | no version bump mandated by this plan; release artifact metadata update only if release policy requires |
| Tag intended at G4? | no (unless devops/user explicitly promotes) |
| Changelog/package files in scope? | TBD by release policy gate; not required for substrate MVP delivery |
| Epic label implies semver? | no; distinct taxonomy |

## Scope and Non-Goals
### In scope
- Browser-smoke preflight/install/run/cleanup-check capability design.
- Canonical statuses: PASS, SKIP-NOT-REQUIRED, SKIP-NOT-CONFIGURED, BLOCKED-INFRA, FAILED-FEATURE.
- Installer opt-in prompt and non-interactive safeguards (Linux/Windows).
- `.gitignore` coverage for runtime/cache paths.
- MVP PDQ/report status plumbing.

### Non-goals / deferred
- Mandatory browser smoke for all QA flows.
- Full browser matrix beyond bounded Chromium baseline.
- Global Playwright install workflows.
- Auto-mutation of user projects not already Playwright-owned.
- Advanced dashboard analytics beyond status surfacing.

## Likely Files and Directories Impacted
- `modules/pidex/browser-smoke/` (new module capability files)
- `modules/pidex/*` integration registry/hooks
- `scripts/modules/*` module invocation/CLI glue
- `install.sh`
- `install.windows.ps1`
- `rules/pidex-qa/no-immortal-test-servers.md` (reference alignment only if needed)
- `rules/pidex-qa/generated-script-syntax-check.md` (reference alignment only if needed)
- `.gitignore`
- `state/browser-smoke/` (runtime dir contract)
- `.cache/ms-playwright/` and/or `.cache/browser-smoke/` (cache dir contract)
- PDQ/reporting status mapping files under `modules/pidex/*` and/or reporting pipeline

## Vertical Slices (Complexity-First)
1. **Slice 1 — Core contract + tracer bullet**
   - Define browser-smoke capability contract and status taxonomy.
   - Implement minimal end-to-end path: preflight result emitted into QA evidence with one canonical status.
   - AC: one demo flow shows deterministic status + evidence artifact; no install side effect.

2. **Slice 2 — Cross-platform preflight + bounded launch probe**
   - Add Linux/Windows probe path using project-local first, PIDEX-local second, else not-configured.
   - Add bounded executable launchability probe with timeout + structured infra failure mapping.
   - AC: probe classifies blocked infra vs not configured without downloading browsers.

3. **Slice 3 — Installer integration + no-surprise behavior**
   - Add interactive human-TTY prompt (default lightweight/no) with plain-language explanation.
   - Add explicit opt-in flags for Linux/Windows; non-interactive never prompts or downloads silently.
   - Windows fallback contract must match Linux semantics:
     1. explicit `-WithBrowserSmoke` / `-SkipBrowserSmoke` wins;
     2. environment overrides (`PIDEX_WITH_BROWSER_SMOKE=1`, `PIDEX_SKIP_BROWSER_SMOKE=1`) win when flags are absent;
     3. `-NonInteractive`, `PIDEX_NONINTERACTIVE=1`, `CI=1`, or no interactive host means skip/no prompt and print enablement instructions;
     4. interactive terminal with no override asks the clear browser-smoke question and defaults to No.
   - AC: installer delegates to module capability, no duplicated setup logic, and Windows evidence covers explicit install, explicit skip, non-interactive skip, and interactive prompt default-No dry-run/manual transcript.

4. **Slice 4 — Safe server harness + cleanup guarantees**
   - Add supervised temp server lifecycle contract: readiness, timeout, shutdown, post-run verification.
   - Enforce generated script syntax-check gate before launch.
   - AC: no orphan server/browser processes under expected failure paths.

5. **Slice 5 — Reporting/PDQ MVP + artifact hygiene**
   - Wire canonical statuses into QA/PDQ summary.
   - Pin status token source of truth in executable module contract, proposed path: `modules/pidex/browser-smoke/scripts/browser-smoke/status.mjs`.
   - Export tokens from that file, e.g. `BROWSER-SMOKE-PASS`, `BROWSER-SMOKE-SKIP-NOT-REQUIRED`, `BROWSER-SMOKE-SKIP-NOT-CONFIGURED`, `BROWSER-SMOKE-BLOCKED-INFRA`, `BROWSER-SMOKE-FAILED-FEATURE`.
   - Add parity tests so preflight/run/reporting cannot drift from the status contract.
   - Add `.gitignore` and artifact path hygiene for runtime/cache.
   - AC: PASS/SKIP/BLOCKED/FAILED visible in report output, tokens come from one executable contract, artifacts ignored in VCS.

6. **Slice 6 — Version/release artifact milestone (final mechanical)**
   - Update release artifact metadata/changelog entries as required by release policy.
   - AC: release artifact owner, gate binding, closure proof recorded.

## Execution Profile
Profile: api-security
Reason: process execution + installer behavior + dependency/install boundaries + reporting status contract.

Skipped Agents: none — standard profile requires full listed pipeline.

Retro Mode: mini
Retro reason: standard feature/infrastructure change, no mandatory full-retro trigger in current scope.
Post-retro handoffs: none.

## Testing Strategy
- Unit: module status contract/export parity, module status mapping, preflight classification, installer decision logic.
- Integration: module capability invocation from installer and QA pipeline.
- E2E/smoke: bounded browser smoke run for Linux + Windows path parity.
- Static checks: generated script syntax validation + lint/type checks for new module surfaces.

## Validation Commands (Linux and Windows)
- Linux dry-run/non-interactive:
  - `./install.sh --help`
  - `CI=1 ./install.sh` (verify no prompt/no browser download)
  - `./install.sh --with-browser-smoke` (explicit opt-in path)
- Windows dry-run/non-interactive:
  - `pwsh -File .\install.windows.ps1 -Help`
  - `pwsh -File .\install.windows.ps1 -DryRun -WithBrowserSmoke`
  - `pwsh -File .\install.windows.ps1 -DryRun -SkipBrowserSmoke`
  - `PIDEX_NONINTERACTIVE=1 pwsh -File .\install.windows.ps1 -DryRun` or PowerShell env equivalent (verify no prompt/download)
  - interactive dry-run/manual transcript showing browser-smoke prompt defaults to No
- QA/module validation:
  - module preflight command (project-local, pidex-local, not-configured scenarios)
  - bounded smoke run command with timeout
  - syntax check command for generated helper scripts prior launch

## Security and Safety Considerations
- Browser process execution bounded by timeout and supervised cleanup.
- No blanket `pkill -f` patterns; prefer owned PID/process-group handles.
- Runtime/cache confined to PIDEX-owned paths.
- No silent network-heavy downloads in default flows.
- Classify infra failures explicitly to prevent false feature-pass claims.

## Migration and Compatibility Constraints
- Preserve current lightweight install default.
- Preserve non-interactive behavior: no prompt, no implicit browser install.
- Maintain backward compatibility for existing installer flags.
- If project already owns Playwright, use it first; otherwise PIDEX-local optional path only.
- No source mutation in user projects for generic enablement.

## PDQ/Dashboard/Reporting Integration (MVP Scope)
- MVP: expose canonical browser-smoke status token + short reason in QA summary.
- MVP: aggregate status counts by run (pass/skip/blocked/failed).
- Deferred: historical trend dashboards, rich infra diagnostics UI, multi-browser breakdown.

## Pre-Implementation Checkpoints
| Check | Requirement |
|---|---|
| Registry status | Verify `@playwright/test` canonical package status before any explicit install path (`npm info @playwright/test dist-tags`). |
| QA safety rules | Enforce adopted rules: `rules/pidex-qa/no-immortal-test-servers.md`, `rules/pidex-qa/generated-script-syntax-check.md`. |

## Risks and Mitigations
- Risk: status misclassification hides feature regression. Mitigation: mandatory status taxonomy + evidence source tagging.
- Risk: orphan processes on failure. Mitigation: supervised harness + post-run cleanup verification.
- Risk: installer surprise behavior drift. Mitigation: explicit interactive vs non-interactive validation on Linux/Windows.
- Risk: dependency drift project vs PIDEX-local. Mitigation: deterministic priority order + evidence of source used.

## Open Questions
- **OPEN QUESTION [RESOLVED]:** Install opt-in scope includes package + browser binaries? Resolution: yes only on explicit opt-in capability call.
- **OPEN QUESTION [RESOLVED]:** Reporting taxonomy names? Resolution: use required canonical set from task caveat.

## User Preview Requirement
| Field | Value |
|---|---|
| UI involved | no |
| Preview required before G4 | no |
| Preview command | none |
| Preview URL/port | none |
| Routes/screens to inspect | none |
| Mobile viewport needed | no |

## Version Management Milestone
| Milestone name | Artifact scope | Owner role | Target gate | Closure proof |
|---|---|---|---|---|
| Release artifact metadata alignment | version/changelog/release note artifacts affected by initiative 024 rollout | pidex-devops | G4 | merged artifact diff + gate note showing target lane and no hidden semver drift |

## Handoff Notes
- Plan intentionally bounded to MVP substrate and safety contracts.
- Advanced analytics and orchestrator-wide runaway kill switch remain deferred unless separately scoped.

## Status Tracking
- Current: Active (planning complete, awaiting critic gate).

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-critic
reason: Implementation-ready plan completed for initiative 024 with bounded slices and validations.
context_file: agents.output/plans/browser-smoke-qa-substrate-plan.md
-->
