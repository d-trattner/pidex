---
title: Windows Compatibility Analysis
type: initiative
sequence: 016
status: validating
stage: milestone-a-windows-bootstrap-and-python-removal-validated
priority: medium
created: 2026-05-22
updated: 2026-05-27
tags: [pidex, initiative, windows, compatibility, portability]
---

# Windows Compatibility Analysis

## One-line goal

Analyze what PIDEX needs before it can run reliably on Windows without weakening the current Linux/direct-mode path.

## Current status

- Status: `validating`
- Stage: `milestone-a-windows-bootstrap-and-python-removal-validated`
- Priority: `medium`

## Next action

Evidence threshold is now met on branch `initiative-016-windows-milestone-a`. Prepare the merge to `main` after one final clean-tree check/push decision.

## Merge reminder

- [x] Run a few real PIDEX pipelines from `initiative-016-windows-milestone-a` against active projects.
- [x] Watch for Node-port regressions in `/pdq`, `/pdwiki`, dashboard provider/parallel-agent pages, and pipeline metrics/events.
- [x] Validate public/default checks after local operator config separation: `npm run public:check` and dashboard typecheck pass on 2026-05-27.
- [ ] Push final branch commit if desired, then merge `initiative-016-windows-milestone-a` into `main`.
- [ ] After merge, re-run `npm run public:check`, dashboard typecheck/build, and Windows smoke commands from [[windows-smoke-test-plan]].

## Evidence collected

- Tracked Python runtime helpers removed; `git ls-files '*.py'` returns zero.
- Python references remaining in tracked runtime are limited to the optional parity harness and unrelated example text.
- Node parity harness compares historical Python quality/wiki behavior where Python is available and skips otherwise.
- Real HAA pipelines completed on the branch: plans `001`, `002`, `003`, `004`, `005`, and `007` are terminal-complete in `state/pipeline-events/haa`.
- Additional homelab/forge.ng smoke reports were already generated during Milestone A validation.
- Dashboard backend, agent balances, parallel-agent settings, pipeline events, metrics, wiki hygiene, and PDQ reports all ran through Node paths.
- Local operator settings are now protected by ignored local override files (`config/*.local.json`) so public defaults can remain safe without wiping live dashboard/agent setup.

## Documents

- [[brief]] — Windows Compatibility Analysis Brief
- [[pi-compatibility-first]] — notes on Pi's own Windows support contract and lessons PIDEX should reuse
- [[pi-windows-baseline]] — Phase 1 Pi Windows support contract and PIDEX ownership split
- [[implementation-plan]] — phased analysis and validation plan
- [[linux-feature-baseline]] — Phase 0 Linux/direct-mode preservation baseline
- [[entrypoint-inventory]] — Phase 2 PIDEX public/internal entrypoint Windows exposure inventory
- [[static-portability-audit]] — Phase 3 static portability risks and mitigation order
- [[compatibility-matrix]] — Phase 4 environment/feature support matrix and support-claim candidates
- [[windows-smoke-test-plan]] — Phase 5 safe laptop smoke checklist for WSL2, Git Bash, and PowerShell audit-only
- [[python-portability-backlog]] — Python-to-Node portability backlog for reducing Windows dependencies

## Navigation

- PIDEX index: [[../../index]]
- PIDEX status: [[../../status]]
- PIDEX roadmap: [[../../roadmap]]
- Active initiatives: [[../index]]
