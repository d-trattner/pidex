---
ID: 4
Origin: 4
UUID: 5098e241
Status: Complete
---

## Executive Summary
3 proposals evaluated from retrospective; all map to existing pipeline friction points. 2 high-impact, 1 medium-impact. No direct workflow blockers. No agent-file edits applied in this run.

## Changelog Pattern Analysis
Docs reviewed: `agents.output/briefs/4-dashboard-parity-mobile-projects-pi-brief.md`, `agents.output/retrospective/4-dashboard-parity-mobile-projects-retrospective.md`, `agents.output/briefs/dashboard-orchestration-quality-metrics-epic.md`.
Handoff pattern: multiple reversions before final route (`pidex-planner → critic → implementer → code-review → qa → uat → devops → pidex-retrospective → pidex-pi`) and escalation to roadmap after plan completion.
Efficiency signal: recurring rework concentrated at planning preflight, security gate escalation, and parity/QA evidence reconciliation.

## Recommendation Analysis
| Rec | Source | Current state | Proposed improvement | Priority | Risk | Affected agents |
|---|---|---|---|---|---|---|
| PROC-NEW-1 | Retro Findings 1/2 + PI brief | Planner has execution-profile contracts but no explicit auto-reject on ui-heavy/profile mismatch combos during authoring | Add planner preflight rule: `ui-heavy` + profile enum invalid/missing => reject before `pidex-critic` handoff; require explicit supported enum + supported profile combination for each route/flow | High | Low | pidex-planner |
| PROC-NEW-2 | Retro finding 4 | Implementer pre-review checks rely on code-level parity, not explicit route/API/page-key smoke matrix | Add shared parity pre-review script/checklist for live route + `/projects`, `/tokens` weekly/monthly + project-switch pagination keys before `pidex-code-review` handoff | High | Medium | pidex-implementer |
| PROC-NEW-3 | Retro finding 5 + PI brief | QA status transition evidence could remain stale across qa/uat/final docs | Add immutable evidence protocol: `qa` doc status patch in same artifact when status transitions, and lint rule that flags stale terminal status mismatch in handoff packet | Medium | Medium | pidex-qa/pidex-devops |
| PI-ALIGN-1 | PI brief (future epic line item) | Future Quality Metrics epic exists but no PI-to-metric bridge yet | Add mapping step: map each PI item to future dashboard metric artifact fields (`went_well`, `went_wrong`, `improvement_points`) before roadmap handoff | Medium | Low | pidex-roadmap/pidex-pi |

## Conflict Analysis
| Recommendation | Conflicting instruction | Nature | Impact if unaddressed |
|---|---|---|---|
| PROC-NEW-1 | `rules/pidex-planner/execution-profile-contract.md`: UI-heavy required and skip-safety rules already demand designer on `ui-heavy` | No contradiction; precision gap (coverage vs enforcement) | Preflight can be added without changing role boundaries |
| PROC-NEW-2 | `agents/pidex-implementer.md`: TDD-first and commit cadence rules do not mention pre-CR parity smoke | Additive; no gate bypass | None if scoped as pre-review checklist row and test artifact requirement |
| PROC-NEW-3 | `rules/pidex-qa` currently lacks explicit status-rewrite rule | No contradiction; adjacent rule scope already says visual proof and proof completeness before `QA Complete` | Stale status can persist across docs and cause handoff ambiguity |
| PI-ALIGN-1 | `agents/pidex-roadmap.md` keeps only business-epic outputs | Not a contradiction; process-only addition outside product-epic writing | If skipped, quality-loop signal stays external and unlinked to roadmap execution |

## Risk Assessment
| Recommendation | Risk level | Rationale | Mitigation |
|---|---|---|---|
| PROC-NEW-1 | LOW | Deterministic preflight; low operational cost | Add one `Plan Lint`-style row and keep strict enum list |
| PROC-NEW-2 | MEDIUM | Extra pre-review burden and possible duplicate checks | Scope to dashboard-parity/API+route classes where token windows or project-switch state is value-critical |
| PROC-NEW-3 | MEDIUM | Requires evidence patch discipline across two agents | Make protocol specific: same file + same section + timestamp + artifact references |
| PI-ALIGN-1 | LOW | Documentation/reporting overhead only | Reuse future-epic fields and auto-append from retrospective outputs |

## Implementation Recommendations
### High-Impact, Low-Risk (implement first)
- 🆕 pidex-planner: add auto-reject lint row for UI-heavy/profile mismatch before critic handoff; keep existing rule chain unchanged.
- 🆕 pidex-qa/pidex-devops bridge: add immutable status-evidence reconciliation check for `BLOCKED`→`COMPLETE` transitions.

### Medium-Impact or Medium-Risk
- 🆕 pidex-implementer: require route/API parity smoke pre-review artifact (`/projects`, `/tokens`, monthly/weekly paging, project-change key reset checks).

### Low-Impact or High-Risk (defer)
- 🆕 pidex-roadmap/pi bridge: add PI-to-epic metric mapping handoff for dashboard quality-metric epic ingestion.

## Suggested Agent Instruction Updates
Pending implementation requires explicit user approval before touching agent/rule files.

Proposed surfaces (post-approval):
- `rules/pidex-planner/index.md` + new rule file for combo-preflight
- `rules/pidex-implementer/index.md` + new parity pre-review rule file
- `rules/pidex-qa/index.md` and/or `rules/pidex-devops/index.md` + status-evidence reconciliation rule file
- `agents.output/roadmap` process note for PI metric handoff (agent-level + future-epic alignment)

Validation plan: keep rule files as tier-1 PROC-NEW entries; avoid direct behavioral drift in agent `.md` core headers.

## User Decision Required
1. approve-all — apply proposal set as PROC-NEW rule updates in two-tier format.
2. defer — keep proposals as advisory only for next PI cycle.
3. reject — discard all proposals and close with advisory record only.

## Related Artifacts
- Retrospective: `agents.output/retrospective/4-dashboard-parity-mobile-projects-retrospective.md`
- Brief: `agents.output/briefs/4-dashboard-parity-mobile-projects-pi-brief.md`
- Future epic draft: `agents.output/briefs/dashboard-orchestration-quality-metrics-epic.md`

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-roadmap
gate: none
reason: PI recommendations recorded and routed; ready for roadmap post-pipeline update.
post_retro_handoffs: pidex-planner,pidex-roadmap,pidex-architect
context_file: agents.output/pi/4-dashboard-parity-mobile-projects-pi.md
-->