---
title: Python Portability Backlog
type: backlog
status: draft
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, python, node, portability]
---

# Python Portability Backlog

## Purpose

Track every Python script and decide whether to keep it, port it to Node for Windows, or make it optional.

Dependency policy for Windows bootstrap:

- Required: PowerShell, Git, Node/npm, Pi, Git Bash.
- Python is no longer required for tracked PIDEX runtime/check scripts.
- The optional parity harness may use `python3` when available to compare current Node behavior against historical Python sources from git; it skips when Python is unavailable.

## Inventory

| Path | Current purpose | Windows priority | Recommendation |
|---|---|---:|---|
| `scripts/compat/windows-audit.py` | Read-only compatibility audit | P0 | Removed after Node replacement `scripts/compat/windows-audit.mjs` became bootstrap/check path. |
| `scripts/compat/test_windows_audit.py` | Python audit tests | P0/P1 | Removed after Node audit test coverage stabilized. |
| `scripts/dashboard/ingest.py` | Dashboard SQLite ingest | P1 | Removed after Node replacement `scripts/dashboard/ingest.mjs` became dashboard/start/check path. |
| `dashboard/lib/server/sqlite-query.py` | Dashboard SQLite query helper | P1 | Removed after Node replacement `dashboard/lib/server/sqlite-query.mjs` became query path. |
| `scripts/wiki/hygiene.py` | Wiki hygiene audit/cadence | P2 | Removed after Node replacement `scripts/wiki/hygiene.mjs` was added with coverage. |
| `scripts/quality/report.py` | PDQ quality report | P2 | Removed after Node replacement `scripts/quality/report.mjs` was added with coverage. |
| `scripts/quality/orchestrator-events.py` | Orchestrator event helpers | P2 | Removed after Node replacement `scripts/quality/orchestrator-events.mjs` was added. |
| `scripts/quality/rule-actions.py` | Rule action ledger | P2 | Removed after Node replacement `scripts/quality/rule-actions.mjs` was added. |
| `scripts/quality/run-auto-pdq.py` | Auto-PDQ trigger | P2 | Removed after Node replacement `scripts/quality/run-auto-pdq.mjs` was added. |
| `scripts/quality/test_report_tdd.py` | Quality report tests | P2 | Removed after Node report tests were added. |
| `scripts/provider-limits/probe.py` | Provider limits probe/profile state | P2 | Removed after Node replacement `scripts/provider-limits/probe.mjs` became dashboard/profile path. |
| `scripts/provider-limits/test_probe_tdd.py` | Provider probe tests | P2 | Removed after Node probe test coverage was added. |
| `scripts/project-context/init.py` | Project context template init | P2 | Removed after Node replacement `scripts/project-context/init.mjs` became orchestrator path. |
| `scripts/parallel-agents/status.py` | Optional parallel-agent status | P3 | Removed after Node replacement `scripts/parallel-agents/status.mjs` became dashboard/API/docs/orchestrator path. |
| `scripts/parallel-agents/run-lane.py` | Manual parallel lane scaffold | P3 | Removed after Node replacement `scripts/parallel-agents/run-lane.mjs` became extension path. |
| `scripts/project-metadata/migrate-to-pidex-folder.py` | Migration helper | P3 | Removed after Node replacement `scripts/project-metadata/migrate-to-pidex-folder.mjs` was added with coverage. |

## Completed

- Added `scripts/compat/windows-audit.mjs` as the Node audit implementation.
- Updated `install.windows.ps1` to use Node audit; Python is no longer part of the Windows bootstrap requirement.
- Added `dashboard/lib/server/sqlite-query.mjs` and switched dashboard query execution from Python to Node with regression coverage.
- Added `scripts/dashboard/ingest.mjs` and switched dashboard auto-ingest from Python to Node with fixture coverage.
- Added `scripts/project-context/init.mjs` and switched PIDEX orchestrator guidance from Python to Node with fixture coverage.
- Ported provider limits, parallel-agent status/run-lane, metrics, pipeline events, public readiness checks, project metadata migration, PDQ quality, rule-action/orchestrator-event helpers, auto-PDQ, and wiki hygiene to Node.
- Removed all tracked `.py` helper implementations.
- Added `scripts/parity/python-node-parity.tdd.test.mjs` to compare historical Python behavior against current Node behavior where Python is available.

## Next candidates

1. Continue real-project smoke on the branch for a few PIDEX pipelines.
2. If no regressions appear, merge `initiative-016-windows-milestone-a` to `main`.
3. Keep any future bug fixes backed by Node tests and, when applicable, parity fixtures.

## Navigation

- Initiative index: [[index]]
- Windows smoke test plan: [[windows-smoke-test-plan]]
- Compatibility matrix: [[compatibility-matrix]]
