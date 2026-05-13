---
ID: dashboard-readiness-plan
Origin: dashboard-readiness-plan
UUID: a7533441
Status: Active
---

## Plan Reference
- Plan: `<pidex-root>/agents.output/planning/dashboard-readiness-plan.md`
- ID: `dashboard-readiness-plan`
- UUID: `a7533441`

## Summary
- Value Statement: Stabilize dashboard build/typecheck/API parity for release readiness.
- Value Delivered: PARTIAL.
- Build+typecheck gates passed, key wiring fixed. Release readiness blocked by git hygiene (dirty broad tree) and one parity ambiguity (`/api/analysis/document` behavior without query context).

## Findings

| # | Cat | Finding | Impact | Action |
|---|-----|---------|--------|--------|
| 1 | PROC | Final gate ran on dirty tree with unrelated churn | No safe scoped devops commit | Add pre-devops tree-clean gate + staged-file allowlist |
| 2 | PLAN | Parity acceptance for `/api/analysis/document` default behavior not explicit | 404 seen, unclear expected outcome | Add endpoint-specific expected status/body matrix in plan |
| 3 | PROC | Build/typecheck fixes validated quickly with slice order | Fast unblock, low rework | Keep router→API→types slice sequence template |
| 4 | PROJ | TanStack package warning left as follow-up | Potential future security/deprecation risk | Create backlog item for verified-safe version pin set |

## Process Improvement Recommendations
- PROC-NEW-1: pidex-planner — require endpoint parity matrix with expected no-arg behavior for each required API route.
- PROC-NEW-2: pidex-devops — enforce clean-tree + selective-stage gate before commit attempt.
- PROC-NEW-3: pidex-implementer — keep readiness remediation playbook: router gen first, API imports second, TS cleanup third.

## Project Improvement Findings
- TanStack router/start/plugin dependency line needs reviewed pin strategy to clear warning surface.

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-pi
reason: Retro complete; process improvements extracted for closure.
post_retro_handoffs: pidex-planner,pidex-roadmap
context_file: <pidex-root>/agents.output/retrospective/dashboard-readiness-retro.md
-->