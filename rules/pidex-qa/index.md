# pidex-qa Rules Index

Last updated: 2026-05-13 (PROC-NEW-88-3)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Authority Change Full-Suite + Fixture Isolation Gate | [authority-change-full-suite-isolation-gate.md](authority-change-full-suite-isolation-gate.md) | 2 | Resolver/path authority changes require early full-suite run and explicit fixture-isolation evidence before QA COMPLETE |
| Docs-Only Release Reconciliation Triad Audit | [docs-only-release-reconciliation-triad-audit.md](docs-only-release-reconciliation-triad-audit.md) | 027-PI-3 | Docs-only release reconciliation QA must audit remote tag proof, roadmap shipped status, and dirty-tree provenance before QA COMPLETE |
| Fan-out Mandatory Smoke + All-Fail Evidence | [fanout-mandatory-smoke-all-fail.md](fanout-mandatory-smoke-all-fail.md) | 71-2 | Fan-out QA requires browser smoke proof plus explicit all-fail evidence before QA COMPLETE |
| Coverage Tool Readiness Preflight | [coverage-tool-readiness-preflight.md](coverage-tool-readiness-preflight.md) | 020-3 | Coverage-dependent QA must run readiness preflight and report canonical PASS/FAIL/SKIPPED/NOT_CONFIGURED/BLOCKED tokens |
| Phase 1 Sequencing Gate | [phase1-sequencing-gate.md](phase1-sequencing-gate.md) | 3 | Complete + document Phase 1 (unit tests) before any Playwright calls |
| Runtime Smoke Requirement | [runtime-smoke.md](runtime-smoke.md) | runtime-smoke | Boot dev server + curl routes when plan changes HTTP/build/cwd surface |
| Browser-Level Smoke | [browser-level-smoke.md](browser-level-smoke.md) | QA-BROWSER-SMOKE | UI/hydration/frontend changes require real-browser smoke checks for console, styles, theme, stacking, responsive behavior |
| Browser Stall Fallback | [browser-stall-fallback.md](browser-stall-fallback.md) | 25 | When mandatory UI browser smoke exhausts tool budget, emit BLOCKED so orchestrator collects Playwright evidence before UAT/G9 |
| Pre-Collect Test Output | [pre-collect-test-output.md](pre-collect-test-output.md) | 36e / 49-1 | On projects with >**1000** tests, orchestrator MUST pre-collect vitest output before spawning pidex-qa (threshold raised 100→1000 by PROC-NEW-49-1) |
| Carry-Forward Open Items Filing | [carry-forward-open-items.md](carry-forward-open-items.md) | 41c | During QA, file open-items.md entries for any item the implementation doc marks as carry-forward/deferred that is not already tracked |
| Timing-Fix Full-Suite Required | [timing-fix-full-suite-required.md](timing-fix-full-suite-required.md) | 43c | For timing/flake-fix plans, QA must run the full suite 4 consecutive times — isolated file runs are explicitly insufficient |
| Playwright Smoke Baseline (Live Data) | [../pidex-planner/live-data-smoke-baseline.md](../pidex-planner/live-data-smoke-baseline.md) | 45b | When executing a V-row that asserts live data appearance: clear storage, assert count=0 before trigger, assert count=N after; inconclusive if pre-existing fixture data present |
| Screenshot Artifact Directory Enforcement | [screenshot-artifact-directory-enforcement.md](screenshot-artifact-directory-enforcement.md) | 54-4 | Any QA screenshot/snapshot artifact must be saved under project `.playwright/` (or plan-declared equivalent) and never committed outside ignored artifact path |
| Fallow Static Audit Gate (JS/TS) | [fallow-static-audit-gate.md](fallow-static-audit-gate.md) | 61-QA | For JS/TS plans, run fallow audit and record evidence (or FALLOW-SKIP rationale) before QA COMPLETE |
| Risk-Logic Coverage Follow-up | [risk-logic-coverage-followup.md](risk-logic-coverage-followup.md) | 61-3 | If touched risk-logic file branch coverage <50%, QA must file follow-up test task before QA COMPLETE/release close |
| Version Coherence Gate | [version-coherence-gate.md](version-coherence-gate.md) | 1 | Before `QA Complete`, verify target version coherent across touched release artifacts and record evidence |
| NOT_CONFIGURED e2e Fallback Matrix + Artifact Existence Gate | [not-configured-e2e-fallback-matrix.md](not-configured-e2e-fallback-matrix.md) | 019-3 | QA may use NOT_CONFIGURED only with fallback matrix evidence and artifact existence checks; otherwise BLOCKED |
| Visual Proof Sufficiency Gate | [visual-proof-sufficiency.md](visual-proof-sufficiency.md) | UI-VISUAL-PROOF | UI-heavy/G9-corrective QA must prove exact selector/container/placement/table claims, not just attach screenshots |
| Dev Host / HMR Console Profile | [dev-host-console-profile.md](dev-host-console-profile.md) | UI-CONSOLE-PROFILE | Browser evidence on custom dev hosts must classify HMR/websocket/console noise before QA Complete |
| Pre-Code-Review UI Proof Packet | [pre-cr-ui-proof-packet.md](pre-cr-ui-proof-packet.md) | 69-1 | Corrective UI/G9/parity plans require browser proof for selectors, geometry, clickability, enabled/disabled transitions, validation, and live/degraded state before QA Complete |
| Async CTA Duplicate-Click Regression | [async-cta-duplicate-click-regression.md](async-cta-duplicate-click-regression.md) | 80-3 | QA must execute and evidence rapid double-click regression for each new/changed async CTA before QA COMPLETE |
| Global Hook Mutation Full-Suite Smoke | [global-hook-mutation-full-suite-smoke.md](global-hook-mutation-full-suite-smoke.md) | PROC-NEW-2 | Global test lifecycle hook mutations require immediate full-suite smoke gate; block on race/flaky signal |
| QA Status / Evidence Reconciliation | [status-evidence-reconciliation.md](status-evidence-reconciliation.md) | QA-STATUS-RECONCILE | When BLOCKED evidence is later supplied, patch the same QA artifact with final status/evidence/ROUTING before UAT/release |
| QA Handoff Evidence Bundle | [qa-handoff-evidence-bundle.md](qa-handoff-evidence-bundle.md) | PROC-NEW-88-3 | QA handoff must include command transcripts, evidence hashes, version checks, failing artifact list, and retry boundary |

## How to use

Read this index at task start. Load specific rule files when relevant to current task.
