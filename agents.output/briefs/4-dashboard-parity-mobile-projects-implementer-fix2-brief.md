# Implementer fix2 brief: dashboard parity mobile/project selector

Project cwd: `/home/daniel/pidex`
Code review v2 rejection: `agents.output/code-review/4-dashboard-parity-mobile-projects-code-review-v2.md`
Expected output: `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation-fix2.md`

Fix only M3:
- `setProjectInSearch` resets only `page`; tokens now use `page_week` and `page_month`.
- Update helper so project changes/clears delete `page`, `page_week`, and `page_month`.
- Add regression test in `dashboard/lib/client/project-query.tdd.test.mjs` or appropriate helper test.
- Run focused tests and typecheck.

ROUTING context_file must be expected output; route to pidex-code-reviewer.
