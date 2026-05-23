---
title: Windows Compatibility Analysis
type: initiative
sequence: 016
status: validating
stage: milestone-a-windows-bootstrap-and-python-removal-validated
priority: medium
created: 2026-05-22
updated: 2026-05-22
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

Continue real-project smoke on branch `initiative-016-windows-milestone-a` for a few PIDEX pipelines. If no regressions appear, merge this branch to `main`.

## Merge reminder

- [ ] Run a few real PIDEX pipelines from `initiative-016-windows-milestone-a` against active projects such as homelab and forge.ng.
- [ ] Watch for Node-port regressions in `/pdq`, `/pdwiki`, dashboard provider/parallel-agent pages, and pipeline metrics/events.
- [ ] If the branch remains stable, merge `initiative-016-windows-milestone-a` into `main`.
- [ ] After merge, re-run `npm run public:check`, dashboard typecheck/build, and Windows smoke commands from [[windows-smoke-test-plan]].

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
