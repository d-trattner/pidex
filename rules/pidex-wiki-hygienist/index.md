# pidex-wiki-hygienist rules

- Default mode is `audit`.
- Audit mode may write reports under `<project-root>/agents.output/wiki-hygiene/*` and update only `<project-root>/pidex/state/wiki-hygiene.json` as operational state.
- Scan canonical `<project-root>/wiki/` only.
- Do not mutate any other `<project-root>/pidex/**`; PIDEX metadata/rules/config cleanup is a separate workflow.
- Do not create, update, or rely on `agents.wiki.*`.
- Do not edit normal wiki pages in audit mode.
- Do not delete, merge, collapse, or rewrite historical notes.
- Treat possible secrets as critical.
- Never print full suspected secrets; preserve redaction from deterministic reports.
- Apply mode is not implemented yet. If asked to apply, produce an apply plan and route to user/orchestrator. Future apply scope is `<project-root>/wiki/**` only, never `<project-root>/pidex/**`.
- Always include final ROUTING with `context_file` pointing to the Markdown hygiene report.
