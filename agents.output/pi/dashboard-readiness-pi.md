---
ID: dashboard-readiness-plan
Origin: dashboard-readiness-plan
UUID: a7533441
Status: Complete
---

## Executive Summary
3 process learnings extracted. 2 high-impact, 1 medium. No agent instruction edits applied (approval gate not opened).

## Changelog Pattern Analysis
Docs reviewed: retrospective findings + recommendations section; devops readiness/tree-state sections.
Pattern: technical readiness green, git hygiene gate weak.

## Recommendation Analysis
| Rec | Source | Current state | Proposed improvement | Priority | Risk |
|---|---|---|---|---|---|
| PROC-NEW-1 | Retro | Planner requires AC but no explicit no-arg endpoint matrix | Add endpoint parity matrix per required API route (status/body incl no-arg) | High | Low |
| PROC-NEW-2 | Retro + Devops | Devops prerequisites mention clean workspace; failure still occurred | Add explicit pre-commit clean-tree + selective-stage allowlist gate checklist item | High | Low |
| PROC-NEW-3 | Retro | Implementer uses slices; sequence not codified as readiness playbook | Add remediation sequence template: router gen → API imports → TS cleanup | Medium | Low |

## Conflict Analysis
No direct contradiction found in current agent docs. Gap type: specificity/operationalization.

## Risk Assessment
| Recommendation | Risk | Mitigation |
|---|---|---|
| PROC-NEW-1 | Low | Keep matrix lightweight; per-route row only |
| PROC-NEW-2 | Low | Reuse existing devops gate language; add explicit pass/fail check |
| PROC-NEW-3 | Low | Frame as default sequence, not hard lock when context differs |

## Implementation Recommendations
1. Implement PROC-NEW-2 first (prevents repeat commit stall).
2. Implement PROC-NEW-1 second (removes API parity ambiguity).
3. Implement PROC-NEW-3 third (keeps fast unblock pattern reusable).

## Suggested Agent Instruction Updates
Target files (after explicit approval):
- `agents/pidex-devops.md`
- `agents/pidex-planner.md`
- `agents/pidex-implementer.md`
Or two-tier preferred: add new rule files + index rows under `<pidex-root>/rules/<agent>/`.

## User Decision Required
Pending if instruction changes requested later: `approve-all` / `defer` / `reject`.
Current run: analysis-only deliverable complete.

## Related Artifacts
- Retro: `<pidex-root>/agents.output/retrospective/dashboard-readiness-retro.md`
- Devops: `<pidex-root>/agents.output/devops/dashboard-readiness-devops.md`
- Output: `<pidex-root>/agents.output/pi/dashboard-readiness-pi.md`

<!-- ROUTING
verdict: COMPLETE
route_to: orchestrator
context_file: <pidex-root>/agents.output/pi/dashboard-readiness-pi.md
-->