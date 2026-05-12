# Analyst brief: dashboard parity/mobile/project selector findings first

Project cwd: `/home/daniel/pidex`
Plan id: `4`
Slug: `dashboard-parity-mobile-projects`
Mode: direct pidex orchestrator.

Confirmed user request:
Optimize dashboard quality charts for mobile so each chart is one line/row. Add a global project select with an `All projects` option. Weekly and monthly views are incomplete because they lack pagination. Analyze other high-confidence enhancements missing compared with the old dashboard and present findings before implementation starts.

Scope boundary confirmed by user:
- Findings first before implementation.
- Implement only high-confidence parity gaps in this run after findings approval.
- Preserve-mostly UI: improve current TanStack dashboard rather than redesign from scratch.
- Explicit priorities: mobile quality charts, global project selector, selected project wired into APIs/views, weekly/monthly token pagination, obvious old-dashboard parity gaps.
- Defer ambiguous or large redesign items to roadmap.

Analyze old vs new dashboard using targeted inspection only:
- `dashboard-old/scripts/server.py` old API behavior/routes.
- `dashboard/routes/*.tsx`, `dashboard/routes/dashboard/*.tsx`, `dashboard/components/navigation/global-nav.tsx`, `dashboard/lib/server/api.ts`, `dashboard/routes/api/*` new implementation.
- Focus on quality, tokens weekly/monthly pagination, project filter/select, and obvious missing dashboard parity.

Expected output: `agents.output/analysis/4-dashboard-parity-mobile-projects-findings.md`

Output requirements:
- Findings table: explicit requested items + high-confidence parity gaps.
- For each finding: old evidence, new evidence, user value, likely files, implementation risk, recommendation (include/defer).
- Separate `Proposed Implementation Scope` and `Deferred/Needs Decision` sections.
- Do not implement code.

ROUTING:
- `route_to: user` because user explicitly requested findings before implementation.
- `context_file: agents.output/analysis/4-dashboard-parity-mobile-projects-findings.md`
