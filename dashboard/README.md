# Running Pi Dashboard

Small local SQLite dashboard for Running Pi metrics, analytics-only pipeline lifecycle events, secondary review lanes, live view, quality charts, and pipeline analyst reports.

## Ingest

```bash
cd /home/daniel/pidex/dashboard
npm run ingest -- --project /home/daniel/projects/local/forge.ng --project /home/daniel/homelab
```

If no projects are passed, ingest uses pidex metrics plus common local project paths when present.

## Pipeline lifecycle events

Direct-mode runs can record analytics-only lifecycle events with:

```bash
~/pidex/scripts/pipeline/event.sh --plan plan-030 --event pipeline_started --status running --actor orchestrator
~/pidex/scripts/pipeline/event.sh --plan plan-030 --event pipeline_completed --status completed --actor orchestrator
```

The helper defaults `project_path` to the current directory and stores JSONL under:

```text
state/pipeline-events/<project-slug>/<pipeline-id>.jsonl
```

Operators never pass SQLite `project_id`; ingest resolves/creates it from `project_path`.

## Serve

Recommended restart helper:

```bash
cd /home/daniel/pidex
./dashboard/start.sh
# prints local and LAN URLs
```

Manual foreground server:

```bash
cd /home/daniel/pidex/dashboard
npm run dev -- --host 0.0.0.0 --port 18777
# http://127.0.0.1:18777
```

## Data

Generated DB:

```text
dashboard/data/pidex.sqlite
```

Pipeline analyst reports are read from:

```text
analysis/**/**-pipeline-analysis.md
```

Generated data directories are gitignored by the root repo.
