---
ID: 4
Origin: 4-dashboard-parity-mobile-projects
UUID: 5098e241
Status: Complete
---

# Post-Retro Planning Insights

- UI-heavy plans must declare supported `Execution Profile: ui-heavy`, must not skip designer, and must retain security when API/query/data surfaces change.
- Findings-first can work well when user asks for it; preserve it as an explicit gate before planner for broad parity tasks.
- URL-query and pagination contracts need route-level acceptance tests: project switch must reset `page`, `page_week`, and `page_month`.
- Plans with visual/mobile claims must specify computed/cascade/browser proof, not screenshot presence alone.
- G9 preview plans on LAN/domain must include upstream reachability proof before asking user to verify.

<!-- ROUTING -->
verdict: COMPLETE
route_to: orchestrator
context_file: agents.output/planning/4-dashboard-parity-mobile-projects-postretro-planning-insights.md
gate: none
reason: Planning insights captured from full retro.
<!-- /ROUTING -->
