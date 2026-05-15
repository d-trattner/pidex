# pidex-wiki-hygienist rules

- Default mode is `audit`.
- Audit mode may write only `<project-root>/agents.output/wiki-hygiene/*`.
- Scan canonical `<project-root>/wiki/` only.
- Do not create, update, or rely on `agents.wiki.*`.
- Do not edit normal wiki pages in audit mode.
- Do not delete, merge, collapse, or rewrite historical notes.
- Treat possible secrets as critical.
- Never print full suspected secrets; preserve redaction from deterministic reports.
- Apply mode is not implemented yet. If asked to apply, produce an apply plan and route to user/orchestrator.
- Always include final ROUTING with `context_file` pointing to the Markdown hygiene report.
