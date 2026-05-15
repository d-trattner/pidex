# pidex

Codex-only fork of Running Pi, normalized to `pidex-*` agents and hardening against non-PIDEX providers.

## Install

```bash
pi install <pidex-root>
# simulate without changing Pi settings:
./install.sh --dry-run
```

Uninstall:

```bash
pi uninstall <pidex-root>
# simulate without changing Pi settings:
./uninstall.sh --dry-run
```


## Quick start

In Pi:

```text
/pidex Add a small helper in ~/my-project
```

`/pd` is available as a short alias. The orchestrator flow is unchanged from Running Pi, but now constrained to Codex models and `pidex-*` role names.

Project session memory:

```text
/pdmem optional note
```

`/pdmem` writes a lightweight session snapshot to `<project-root>/wiki/session-memory/` and updates that folder's `index.md`.

## Repo scope

- `agents/` – role prompts
- `rules/` – role-specific rules
- `templates/` – artifact/checklist templates
- `extensions/pidex/` – Pi extension entrypoint (`pidex_agent`)
- `config/agents.json` – codex-only routing
- `config/profiles/*.json` – provider/profile presets, including Spark/no-Spark variants
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

- New app (TanStack Start): `dashboard/`
- Legacy archive: `dashboard-old/` (reference/validation only)

Current dashboard sections:

- **Overview** – high-level pipeline, agent, cost, and event KPIs.
- **Live** – active projects, running pipelines, timeline, latest agent runs, and context/MD modal.
- **Runs** – agent and completed pipeline tables with formatted timestamps, durations, cost, and context-document buttons.
- **Quality** – completion/runtime/model-quality charts and artifact health signals.
- **Usage** – provider limits, active profile, token consumption, quota trends, and profile switching.
- **Wiki** – project-scoped markdown browser for `agents.output` and auto-detected `wiki` roots.
- **Settings** – active profile, configured profiles, and provider-limit refresh status.

Dashboard UX notes:

- Core dashboard data polls every 5 seconds via TanStack Query.
- Desktop header is fixed; mobile uses bottom-sheet navigation.
- `/wiki` requires a selected project; “All Projects” shows a project-selection message.
- Markdown viewers format frontmatter and PIDEX `<!-- ROUTING ... -->` blocks as cards.
- Tables scroll internally to avoid whole-card/page overflow.

## Provider limits and profiles

PIDEX tracks provider-native Codex quota windows:

- `codex` and `codex-spark`
- `five_hour` and `seven_day`
- usage represented as `used_percent`

The dashboard/API refreshes stale provider-limit state automatically. Spark alerts are suppressed when the active profile is a no-Spark profile, unless explicitly overridden with:

```bash
PIDEX_PROVIDER_ALERT_SPARK_WHEN_INACTIVE=1
```

Spark limit protection:

- If Spark usage reaches 99% or the provider reports Spark as blocked, PIDEX auto-switches to the equivalent no-Spark profile when available.
- Example mappings:
  - `5.3-plus-spark-balanced` → `5.3-no-spark-balanced`
  - `5.3-plus-spark-xhigh` → `5.3-no-spark-xhigh`
  - `5.5-plus-spark-balanced` → `5.5-no-spark-balanced`

## Automatic quality reports

Terminal pipeline lifecycle events trigger automatic PDQ quality reports by default:

- `pipeline_completed`
- `pipeline_failed`
- `pipeline_aborted`
- `pipeline_cancelled`

Disable with:

```bash
PIDEX_AUTO_PDQ=0
```

Reports are written under `state/quality/` and `agents.output/quality/`, with an `OpQualityReview` operator event.

## Future briefs

Notable future-epic briefs live under `agents.output/briefs/`, including:

- `pidex-sketch-intake-tool-idea.md` – disposable sketch/design intake tool for UI-heavy preflight.
- `claude-subscription-opportunistic-secondary-lanes.md` – optional Claude subscription secondary lanes if policy/support permits after June 15, 2026.
