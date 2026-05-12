# Planner brief: dashboard parity mobile/project selector

Project cwd: `/home/daniel/pidex`
Plan id: `4`
Slug: `dashboard-parity-mobile-projects`
Findings: `agents.output/analysis/4-dashboard-parity-mobile-projects-findings.md`
Mode: direct pidex orchestrator.

User approved findings and recommended implementation scope.

Confirmed epic:
Improve the PIDEX TanStack dashboard by restoring high-confidence old-dashboard parity while preserving the current design. Optimize the Quality page for mobile so each chart/card is one per row. Add a global project selector with `All projects`, backed by URL query state, and wire it into Overview, Runs, Pipelines, Quality/model-quality, Tokens, and Live. Implement weekly and monthly token pagination matching old-dashboard behavior. Restore high-confidence missing Quality surfaces: gate friction, malformed routing trend, G9 events/rejections, and merge dispositions/classifications. Defer full old quality recreation, runs per-column filters, and dedicated secondary/malformed pages.

UI intent:
- preserve-mostly. Keep current glass/TanStack dashboard visual language; no redesign.
- User wants findings-first; findings now approved.

Acceptance:
- `/quality` mobile viewport shows one chart/card per row; desktop grid preserved.
- Header/mobile nav includes global project select with `All projects`.
- Project selection persists in URL query and changes data on listed routes.
- Weekly and monthly Tokens views have Older/Newer pagination with correct API `page`, `has_older`, `has_newer` behavior.
- Quality page renders the approved parity subset.
- Build/typecheck/tests pass; browser screenshots for mobile quality and project selector flows.

Expected planner output: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`

ROUTING: route to `pidex-critic` when complete; context_file must be the plan artifact.
