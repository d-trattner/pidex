# PIDEX Dashboard

The PIDEX dashboard is a local analytics UI for pipeline state, quality, provider usage, wiki browsing, and settings.

## Start

```bash
cd <pidex-root>/dashboard
./start.sh
```

Default local URL:

```text
http://127.0.0.1:18777/dashboard
```

If exposed through the local proxy, use the friendly domain shown by `start.sh`, for example:

```text
http://pi.lan/dashboard
```

## App locations

- Current TanStack Start app: `<pidex-root>/dashboard/`
- Legacy archive: `<pidex-root>/dashboard-old/` — reference/validation only

## Sections

- **Overview** — high-level pipeline, agent, cost, and event KPIs.
- **Live** — active projects, running pipelines, timeline, latest agent runs, and context/markdown modal.
- **Runs** — agent and completed pipeline tables with formatted timestamps, durations, cost, and context-document buttons.
- **Quality** — completion/runtime/model-quality charts and artifact health signals.
- **Usage** — provider limits, active profile, token consumption, quota trends, and profile switching.
- **Wiki** — project-scoped markdown browser for `agents.output` and auto-detected `wiki` roots.
- **Settings** — active profile, configured profiles, and provider-limit refresh status.

## UX notes

- Core dashboard data polls every 5 seconds via TanStack Query.
- Desktop header is fixed.
- Mobile uses bottom-sheet navigation.
- `/wiki` requires a selected project; “All Projects” shows a project-selection message.
- Markdown viewers format frontmatter and PIDEX `<!-- ROUTING ... -->` blocks as cards.
- Tables scroll internally to avoid whole-card/page overflow.

## Useful checks

```bash
cd <pidex-root>
npm --prefix dashboard run typecheck
```
