# PIDEX Dashboard

The PIDEX dashboard is a local analytics UI for pipeline state, quality, provider usage, wiki browsing, and settings.

## Start

Dashboard commands assume the canonical `<pidex-root>` checkout. If you installed PIDEX through the lightweight Pi package bootstrap, run `/pidex-init-home` first and then `/reload` so `<pidex-root>` resolves to `~/pidex`.

Cross-platform launcher:

```bash
cd <pidex-root>
node dashboard/start.mjs
```

This Node launcher is the preferred entrypoint on native Windows or any environment where Bash is unavailable. The Linux shell launcher remains available for compatibility:

```bash
cd <pidex-root>/dashboard
./start.sh
```

The Linux installer installs PIDEX workspace dependencies when needed. If you used `./install.sh --skip-dashboard-deps`, run `pnpm install --frozen-lockfile --ignore-scripts` with pinned pnpm `10.33.0` from the PIDEX root before starting the dashboard.

See [Windows status](windows.md).

Default local URL:

```text
http://127.0.0.1:18777/dashboard
```

If you expose the dashboard through your own LAN DNS/reverse proxy, pass the domain explicitly so the launcher prints it:

```bash
node dashboard/start.mjs --host 0.0.0.0 --domain your.local.name
```

or, from `<pidex-root>/dashboard` on Linux/WSL2:

```bash
./start.sh --host 0.0.0.0 --domain your.local.name
```

You can also set a local default domain in `config/dashboard.local.json`:

```json
{
  "domain": "your.local.name"
}
```

The public default `config/dashboard.json` leaves the domain unset. PIDEX does not assume a built-in LAN domain.

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
pnpm -C dashboard run typecheck
```
