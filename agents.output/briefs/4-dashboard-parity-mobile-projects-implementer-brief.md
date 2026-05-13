# Implementer brief: dashboard parity mobile/project selector

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
Findings: `agents.output/analysis/4-dashboard-parity-mobile-projects-findings.md`
Design: `agents.output/design/4-dashboard-parity-mobile-projects-design.md`
Critic approval: `agents.output/critic/4-dashboard-parity-mobile-projects-critique-v2.md`
Expected output: `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation.md`

Implement approved scope only:
- Mobile Quality: one card/chart per row on narrow screens, desktop preserved.
- Global project selector with `All projects`, URL query state. Desktop header and mobile sheet/menu must expose it accessibly.
- Wire project query into Overview, Runs, Pipelines, Quality/model-quality, Tokens, Live.
- Token weekly and monthly pagination with Older/Newer controls and API `page`, `has_older`, `has_newer` behavior matching old dashboard.
- Restore approved Quality subset: gate friction, malformed trend, G9 events/rejections, merge disposition/classification summaries.
- Preserve current glass UI; do not implement deferred features.

Constraints:
- Inspect `git status --short` first; repo is dirty. Preserve unrelated changes.
- Do not touch old dashboard except as reference.
- Add focused tests where feasible for token pagination/project query helpers.
- Run typecheck/build/focused tests as feasible.
- Designer requested post-implementation audit before QA/UAT; mention in handoff.

ROUTING context_file must be expected output; route to pidex-code-reviewer when complete.
