# Planner revision brief: dashboard parity mobile/project selector

Project cwd: `/home/daniel/pidex`
Plan to revise: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
Critique: `agents.output/critic/4-dashboard-parity-mobile-projects-critique.md`
Expected output: update/overwrite `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`

Revise only to fix critic blockers:
- C1: Do not skip designer. This is UI-heavy: header/mobile selector, responsive charts, token controls, accessibility, screenshots. Route designer after critic approval.
- C2: Replace unsupported composite execution profile. Use supported `Execution Profile: ui-heavy`, and explicitly state security remains required because API/query-state/token pagination changes touch server/data paths.
- Update skipped-agent table accordingly: `pidex-designer: do not skip`, `pidex-security: do not skip`, `pidex-qa/uat: do not skip`.
- Keep retro mini unless new mandatory trigger.
- Keep target release TBD as non-blocking or clarify.

Do not implement.

ROUTING must route to `pidex-critic` and use the plan as context_file.
