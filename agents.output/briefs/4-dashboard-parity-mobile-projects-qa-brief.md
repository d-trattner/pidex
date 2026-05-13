# QA brief: dashboard parity mobile/project selector

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
Security approval: `agents.output/security/4-dashboard-parity-mobile-projects-security-v3.md`
Code review: `agents.output/code-review/4-dashboard-parity-mobile-projects-code-review-v3.md`
Implementation docs: all `agents.output/implementation/4-dashboard-parity-mobile-projects*.md`
Expected output: `agents.output/qa/4-dashboard-parity-mobile-projects-qa.md`

QA scope:
- Fallow audit required per `rules/pidex-qa/fallow-static-audit-gate.md`.
- Run focused JS tests: project-query, token-pages, token pagination, error sanitization; typecheck/build/audit.
- API smoke: project selector query affects summary/quality/model-quality/tokens/live; tokens weekly/monthly page metadata works.
- Browser evidence: mobile `/quality` one card per row, desktop quality preserved, global project selector, tokens weekly/monthly controls, selected project URL state.
- If browser smoke blocked, route to orchestrator with reason containing `browser smoke BLOCKED`.

ROUTING context_file must be expected output.
