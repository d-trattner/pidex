# pidex

Codex-only fork of Running Pi, normalized to `pidex-*` agents and hardened against non-PIDEX providers.

## Detailed feature docs

More detailed documentation for complex features lives in [`readme/`](readme/):

- [Dashboard](readme/dashboard.md)
- [Provider limits and profiles](readme/provider-limits-and-profiles.md)
- [Global Git security hook](readme/security-hooks.md)
- [Wiki hygiene](readme/wiki-hygiene.md)
- [Automatic quality reports](readme/automatic-quality-reports.md)
- [Project session memory](readme/project-memory.md)
- [Future briefs](readme/future-briefs.md)

## Install

```bash
pi install <pidex-root>
# simulate without changing Pi settings:
<pidex-root>/install.sh --dry-run
```

Uninstall:

```bash
pi uninstall <pidex-root>
# simulate without changing Pi settings:
<pidex-root>/uninstall.sh --dry-run
```

## Quick start

In Pi:

```text
/pidex Add a small helper in ~/my-project
```

`/pd` is available as a short alias. The orchestrator flow is inherited from Running Pi, but constrained to Codex models and `pidex-*` role names.

Project session memory:

```text
/pdmem optional note
```

`/pdmem` writes to `<project-root>/wiki/session-memory/`. See [Project session memory](readme/project-memory.md).

## Repo scope

- `agents/` – role prompts
- `rules/` – role-specific rules
- `templates/` – artifact/checklist templates
- `extensions/pidex/` – Pi extension entrypoint (`pidex_agent`)
- `config/agents.json` – Codex-only routing
- `config/profiles/*.json` – provider/profile presets, including Spark/no-Spark variants
- `scripts/delegate/` – `codex` delegate/auth wrapper
- `scripts/metrics/` + `scripts/pipeline/` – analytics helpers
- `scripts/analysis/` – pipeline analysis scaffold
- `dashboard/` – local analytics UI
- `readme/` – detailed feature docs

## Smoke checks

```bash
cd <pidex-root>
bash scripts/doctor.sh
bash scripts/smoke-test.sh
bash -n scripts/delegate/codex.sh scripts/delegate/check-auth.sh scripts/metrics/record.sh scripts/metrics/summarize.sh scripts/pipeline/event.sh scripts/analysis/run-pipeline-analysis.sh
python3 -m py_compile dashboard-old/scripts/ingest.py dashboard-old/scripts/server.py
```

## Dashboard

```bash
cd <pidex-root>/dashboard
./start.sh
```

The dashboard provides Overview, Live, Runs, Quality, Usage, Wiki, and Settings sections. See [Dashboard](readme/dashboard.md).

## Provider limits and profiles

PIDEX tracks provider-native Codex quota windows, including Spark/no-Spark profile behavior and automatic no-Spark fallback when Spark is exhausted. See [Provider limits and profiles](readme/provider-limits-and-profiles.md).

## Global Git security hook

PIDEX can optionally install a global Git pre-commit security hook for this Linux user. The hook saves/restores any previous global `core.hooksPath` and does not chain old hooks. See [Global Git security hook](readme/security-hooks.md).

## Wiki hygiene

Run a read-only wiki hygiene audit with `/pdwiki`. Reports are written to `agents.output/wiki-hygiene/`. See [Wiki hygiene](readme/wiki-hygiene.md).

## Automatic quality reports

Terminal pipeline lifecycle events can trigger automatic PDQ quality reports. Disable with:

```bash
PIDEX_AUTO_PDQ=0
```

See [Automatic quality reports](readme/automatic-quality-reports.md).

## Future briefs

Notable future-epic briefs live under `agents.output/briefs/`. See [Future briefs](readme/future-briefs.md).
