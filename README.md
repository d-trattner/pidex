# pidex

Codex-only fork of Running Pi, normalized to `pidex-*` agents and hardening against non-PIDEX providers.

## Install

```bash
pi install ~/pidex
# simulate without changing Pi settings:
./install.sh --dry-run
```

Uninstall:

```bash
pi uninstall ~/pidex
# simulate without changing Pi settings:
./uninstall.sh --dry-run
```


## Quick start

In Pi:

```text
/pd Add a small helper in ~/my-project
```

The orchestrator flow is unchanged from Running Pi, but now constrained to Codex models and `pidex-*` role names.

## Repo scope

- `agents/` – role prompts
- `rules/` – role-specific rules
- `templates/` – artifact/checklist templates
- `extensions/pidex/` – Pi extension entrypoint (`pidex_agent`)
- `config/agents.json` – codex-only routing
- `config/profiles/codex-*.json` – profile presets
- `scripts/delegate/` – `codex` delegate/auth wrapper
- `scripts/metrics/` + `scripts/pipeline/` – analytics helpers
- `scripts/analysis/` – pipeline analysis scaffold
- `dashboard/` – local analytics UI

## Smoke checks

```bash
bash scripts/doctor.sh
bash scripts/smoke-test.sh
bash -n scripts/delegate/codex.sh scripts/delegate/check-auth.sh scripts/metrics/record.sh scripts/metrics/summarize.sh scripts/pipeline/event.sh scripts/analysis/run-pipeline-analysis.sh
python3 -m py_compile dashboard-old/scripts/ingest.py dashboard-old/scripts/server.py
```

## Dashboard

```bash
cd dashboard
./start.sh
```

- Neue App (TanStack Start): `dashboard/`
- Legacy-Archiv: `dashboard-old/` (nur Referenz/Validierung)
