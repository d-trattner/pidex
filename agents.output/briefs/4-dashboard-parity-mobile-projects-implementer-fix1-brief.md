# Implementer fix brief: dashboard parity mobile/project selector

Project cwd: `<pidex-root>`
Code review rejection: `agents.output/code-review/4-dashboard-parity-mobile-projects-code-review.md`
Expected output: `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation-fix1.md`

Fix only code-review blockers:
- M1: `/tokens` has weekly pagination only. Add monthly token UI/API fetch/card with Older/Newer controls, metadata/range, and project query preservation. Ensure SM-6 can be validated.
- M2: `/api/live?project=...` ignores project. Pass request search from route and apply `parseProjectFilter` to live queries in `getLiveState(search = '')` so selected project scopes live data.

Add targeted proof/tests if feasible. Rerun focused helper tests + typecheck. Preserve unrelated dirty changes.

ROUTING context_file must be expected output; route to pidex-code-reviewer when complete.
