# PIDEX Dashboard

The PIDEX dashboard is a local analytics UI for pipeline state, quality, provider usage, wiki browsing, and settings.

## Start

Linux / WSL2:

```bash
cd <pidex-root>/dashboard
./start.sh
```

The Linux installer installs dashboard dependencies when needed. If you used `./install.sh --skip-dashboard-deps`, run `npm --prefix <pidex-root>/dashboard ci` before starting the dashboard.

Windows native support is experimental; do not use the Linux `start.sh` launcher as the Windows entrypoint. See [Windows status](windows.md).

Default local URL:

```text
http://127.0.0.1:18777/dashboard
```

If exposed through the local proxy, use the friendly domain shown by `start.sh`, for example:

```text
http://pi.lan/dashboard
```

## App locations

- TanStack Start app: `<pidex-root>/dashboard/`
- Dashboard ingest helper: `<pidex-root>/scripts/dashboard/ingest.mjs`

## Sections

- **Overview** — high-level pipeline, agent, cost, and event KPIs.
- **Live** — active projects, running pipelines, timeline, latest agent runs, and context/markdown modal.
- **Runs** — agent and completed pipeline tables with formatted timestamps, durations, cost, and context-document buttons.
- **Quality** — selector-scoped PDQ quality metrics, trace gaps, operator contract findings, quality trends, background governance status, completion/runtime/model-quality charts, and artifact health signals.
- **Usage** — provider limits, active profile, token consumption, quota trends, profile switching, and estimate-only agent balance/runway cards.
- **Wiki** — project-scoped markdown browser for `agents.output` and auto-detected `wiki` roots.
- **Context** — project-scoped editor for `pidex/context/CONTEXT.md` domain language, relationships, example dialogue, and flagged ambiguities.
- **Settings** — active profile, configured profiles, provider-limit refresh status, optional parallel-agent configuration, Quality Governance local settings, and estimate-only agent balance inputs.

## UX notes

- Core dashboard data polls every 5 seconds via TanStack Query.
- Desktop header is fixed.
- Mobile uses bottom-sheet navigation.
- The global project selector scopes quality/dashboard project metrics. “All Projects” aggregates non-smoke latest quality reports.
- `/wiki` and `/context` require a selected project; “All Projects” shows a project-selection message.
- Markdown viewers format frontmatter and PIDEX `<!-- ROUTING ... -->` blocks as cards.
- Context fields use wrapping textareas for long terms, definitions, aliases, relationships, dialogue, and ambiguity notes.
- Tables scroll internally to avoid whole-card/page overflow.

## Useful checks

```bash
cd <pidex-root>
npm --prefix dashboard run typecheck
```
