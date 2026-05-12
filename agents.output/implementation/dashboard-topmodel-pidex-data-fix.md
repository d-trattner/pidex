---
status: Complete
---

# Dashboard Top Model PIDEX Data Fix

## Problem
`/api/summary` top model showed `minimax`, which cannot be PIDEX-native provider data.

## Root Cause
`dashboard-old/scripts/ingest.py` default project discovery still pulled external/historical project artifact trees:

- `/home/daniel/projects/local/forge.ng`
- `/home/daniel/homelab`
- projects discovered from historical metrics

Those artifacts included secondary review labels like `minimax` and `deepseek`. The summary `by_model` union includes `artifacts.model_label`, so old/historical non-PIDEX artifacts polluted PIDEX dashboard top-model stats.

## Fix
Updated `dashboard-old/scripts/ingest.py`:

- PIDEX-native default now ingests only explicitly requested PIDEX/dashboard artifact roots.
- Historical external project discovery is behind opt-in env:
  - `PIDEX_DASHBOARD_INCLUDE_EXTERNAL_PROJECTS=1`

Rebuilt `dashboard/data/pidex.sqlite` from clean state.

## Validation
- `minimax` no longer appears in summary top models.
- Current `/api/summary` top models:
  - `gpt-5.3-codex`
  - `gpt-5.5`
  - `gpt-5.3-codex-spark`
- `curl http://127.0.0.1:18777/api/summary` returns PIDEX-native provider rows only.

<!-- ROUTING -->
verdict: COMPLETE
route_to: user
context_file: agents.output/implementation/dashboard-topmodel-pidex-data-fix.md
gate: none
reason: Removed historical external project artifact ingestion from PIDEX dashboard default and rebuilt DB.
<!-- /ROUTING -->
