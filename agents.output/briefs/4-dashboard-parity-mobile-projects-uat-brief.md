# UAT brief

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
QA: `agents.output/qa/4-dashboard-parity-mobile-projects-qa.md`
Security: `agents.output/security/4-dashboard-parity-mobile-projects-security-v3.md`
Expected output: `agents.output/uat/4-dashboard-parity-mobile-projects-uat.md`

UAT objective: validate user-facing acceptance:
- mobile Quality charts/cards one per row; desktop preserved.
- global project selector with All projects and URL query state.
- project query affects target routes including Live.
- Tokens weekly/monthly pagination controls exist.
- approved Quality subset visible.
- screenshots exist in `dashboard/.playwright/4-dashboard-parity-*.png`.

Do not modify files. If user preview needed, emit gate G9; otherwise approve route devops.

ROUTING context_file must be expected output.
