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
- Optional: Python for advanced PIDEX features until ported.
- Avoid requiring Python for the basic Windows one-line installer.

## Inventory

| Path | Current purpose | Windows priority | Recommendation |
|---|---|---:|---|
| `scripts/compat/windows-audit.py` | Read-only compatibility audit | P0 | Port first to Node so Windows bootstrap does not require Python. Keep Python version temporarily for parity/reference. |
| `scripts/compat/test_windows_audit.py` | Python audit tests | P0/P1 | Replace/add Node audit tests after Node audit stabilizes. |
| `scripts/dashboard/ingest.py` | Dashboard SQLite ingest | P1 | Port or wrap in Node so dashboard path can become Python-free. |
| `dashboard/lib/server/sqlite-query.py` | Dashboard SQLite query helper | P1 | Node replacement added as `dashboard/lib/server/sqlite-query.mjs`; dashboard query path now uses Node. Keep Python file temporarily until parity is proven. |
| `scripts/wiki/hygiene.py` | Wiki hygiene audit/cadence | P2 | Large feature; port only after bootstrap/dashboard basics. |
| `scripts/quality/report.py` | PDQ quality report | P2 | Large feature; keep Python optional until Node port is justified. |
| `scripts/quality/orchestrator-events.py` | Orchestrator event helpers | P2 | Port with quality suite if needed. |
| `scripts/quality/rule-actions.py` | Rule action ledger | P2 | Port with quality suite if needed. |
| `scripts/quality/run-auto-pdq.py` | Auto-PDQ trigger | P2 | Port after report.js exists, or keep optional. |
| `scripts/quality/test_report_tdd.py` | Quality report tests | P2 | Replace with Node tests if quality is ported. |
| `scripts/provider-limits/probe.py` | Provider limits probe/profile state | P2 | Port if Windows dashboard/provider features require Python-free path. |
| `scripts/provider-limits/test_probe_tdd.py` | Provider probe tests | P2 | Replace with Node tests if probe is ported. |
| `scripts/project-context/init.py` | Project context template init | P2 | Small enough to port later; not needed for installer smoke. |
| `scripts/parallel-agents/status.py` | Optional parallel-agent status | P3 | Optional advanced feature; keep Python for now. |
| `scripts/parallel-agents/run-lane.py` | Manual parallel lane scaffold | P3 | Optional advanced feature; keep Python for now. |
| `scripts/project-metadata/migrate-to-pidex-folder.py` | Migration helper | P3 | Historical/migration-only; do not prioritize. |

## Completed

- Added `scripts/compat/windows-audit.mjs` as the Node audit implementation.
- Updated `install.windows.ps1` to use Node audit and make Python optional for bootstrap.
- Added `dashboard/lib/server/sqlite-query.mjs` and switched dashboard query execution from Python to Node with regression coverage.

## Next candidates

1. Port dashboard ingest (`scripts/dashboard/ingest.py`) to Node or design an incremental parity harness.
2. Decide when to remove temporary Python query helper after Node query path is proven on Linux and Windows.
3. Keep Python features clearly documented as optional advanced capabilities until ported.

## Navigation

- Initiative index: [[index]]
- Windows smoke test plan: [[windows-smoke-test-plan]]
- Compatibility matrix: [[compatibility-matrix]]
