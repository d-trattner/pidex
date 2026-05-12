# Implementer continuation brief: dashboard parity mobile/project selector

Project cwd: `/home/daniel/pidex`
Original plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
Continuation plan: `agents.output/planning/4-dashboard-parity-mobile-projects-continuation.md`
Prior implementation: `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation.md`
Design: `agents.output/design/4-dashboard-parity-mobile-projects-design.md`
Expected output: `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation-continuation.md`

Implement remaining approved scope only:
- Global project selector with All projects, URL query state, desktop header and mobile menu/sheet.
- Wire project query into Overview, Runs, Pipelines, Quality/model-quality, Tokens, Live.
- Token weekly/monthly UI controls using existing backend pagination helper/API.
- Quality mobile one-card-per-row and approved parity subset.
- Focused tests/typecheck/build as feasible.

Do not redo completed backend pagination helper unless needed. Preserve unrelated dirty changes.

ROUTING context_file must be expected output; route to pidex-code-reviewer if complete.
