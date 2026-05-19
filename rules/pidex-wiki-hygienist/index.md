# pidex-wiki-hygienist rules

- For structural code searches, load [../shared/structural-code-search.md](../shared/structural-code-search.md): prefer ast-grep for code structure and rg for literal text.
- Default mode is `audit`.
- Audit mode may write reports under `<project-root>/agents.output/wiki-hygiene/*` and update only `<project-root>/pidex/state/wiki-hygiene.json` as operational state.
- Scan canonical `<project-root>/wiki/` only.
- Do not mutate any other `<project-root>/pidex/**`; PIDEX metadata/rules/config cleanup is a separate workflow.
- Do not create, update, or rely on `agents.wiki.*`.
- Do not edit normal wiki pages in audit mode.
- Do not delete, merge, collapse, or rewrite historical notes.
- Treat possible secrets as critical.
- Never print full suspected secrets; preserve redaction from deterministic reports.
- Apply mode is not implemented yet. If asked to execute/apply, produce a separate `<project-root>/agents.output/wiki-hygiene/<timestamp>-execution-report.md` and route to user/orchestrator. Future apply scope is `<project-root>/wiki/**` only, never `<project-root>/pidex/**`.
- Execution reports must not overwrite deterministic audit reports. Include source audit path, requested scope, actions taken or `NO_CHANGES_APPLIED`, changed files, skipped/deferred items, validation, and commit recommendation.
- After audit/report-only runs, ask the user whether to commit the wiki hygiene artifacts/state. Show the exact changed/untracked paths first.
- Never suggest committing `agents.output/**`; hygiene reports/execution reports stay generated and uncommitted.
- Treat `pidex/state/wiki-hygiene.json` as the audit-state commit candidate when the user wants hygiene history preserved in Git. This path may be ignored by `.gitignore`; tell the orchestrator to use `git add -f pidex/state/wiki-hygiene.json` if needed.
- If future apply mode mutates `wiki/**`, ask about committing those wiki changes too after showing the exact changed files.
- Final summary for audit/report-only runs must include a useful brief: score, critical/high/medium/low counts, top findings or "no findings", report path, state path updated, whether wiki content changed, and a commit question. Suggested commit files must include `pidex/state/wiki-hygiene.json` only for audit-only runs; do not include `agents.output/**`. Include a suggested commit message such as `chore(wiki): record hygiene audit`.
- Always include final ROUTING with `context_file` pointing to the audit report for audit-only runs or the execution report for execute/apply requests.
