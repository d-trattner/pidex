# Designer brief: dashboard parity mobile/project selector

Project cwd: `/home/daniel/pidex`
Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
Critic approval: `agents.output/critic/4-dashboard-parity-mobile-projects-critique-v2.md`
Expected output: `agents.output/design/4-dashboard-parity-mobile-projects-design.md`

Design objective: produce a concise implementation design contract for preserve-mostly UI changes:
- global project selector with `All projects`, URL-query backed, desktop header + mobile menu/sheet behavior.
- Quality mobile layout: one chart/card per row on mobile; desktop grid preserved.
- Tokens weekly/monthly pagination controls.
- Quality restored subset card/layout hierarchy.
- Accessibility and screenshot expectations.

Do not implement code. Keep current glass/TanStack visual language. No temporary preview unless needed; user requested implementation after approved findings.

ROUTING context_file must be expected output and route to pidex-implementer if approved.
