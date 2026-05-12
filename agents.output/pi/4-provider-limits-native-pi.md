---
ID: 4
Origin: 4
UUID: 70d50d80
Status: Complete
---

## Executive Summary
3 PI proposals extracted from retro. 2 high-impact, 1 medium-impact. No rule-file edits applied in this run. Overall risk: LOW-MED (cross-agent consistency, no workflow bypass).

## Changelog Pattern Analysis
Docs reviewed: `agents.output/briefs/4-provider-limits-native-pi-brief.md`, `agents.output/retrospective/4-provider-limits-native-retrospective.md`.
Handoff pattern: retrospective routed `pidex-pi`; no contradictory evidence passed into roadmap yet.
Efficiency signal: recurring rework stemmed from missing negative security proof and plan acceptance artifacts, not implementation throughput.

## Recommendation Analysis
| Rec | Source | Current state | Proposed change | Priority | Risk | Affected agents |
|---|---|---|---|---|---|---|
| PROC-NEW-1 | Retro F1 | Implementer has hard TDD-first and mutation checks, but no token/bind-specific pre-review security matrix as standard on bind/auth changes | Add explicit pre-review requirement: for each token/bind/security-sensitive route change, include threat matrix cases (spoofed Host, non-loopback write, public-bind matrix) in acceptance pack before code-review handoff | High | Low | pidex-implementer |
| PROC-NEW-2 | Retro F1 | Devops checks status transitions and release states; no explicit QA status/token reconciliation step after evidence closure | Add pre-route doc reconciliation step: fail if QA final status token (`QA Blocked/QA Complete`) contradicts routed evidence, then auto-repair to `QA Complete` with timestamp + proof references | High | Medium | pidex-devops |
| PROC-NEW-3 | Retro F1 | Planner supports explicit AC and fixture derivation rules, but no dedicated native provider assertion pattern in default acceptance template | Add acceptance template pattern: codex + codex-spark fixture-backed assertions and `/limits` browser-proof evidence row in plan AC set (not test procedure) | Medium | Low | pidex-planner |

## Conflict Analysis
| Recommendation | Conflicting instruction | Nature | Impact if unaddressed | Proposed resolution |
|---|---|---|---|---|
| PROC-NEW-1 | `agents/pidex-implementer.md`: `## CRITICAL CONSTRAINT: TDD-First Development` and existing mutation security checklist | No direct contradiction; refinement gap. Current rules lack explicit token/public-bind matrix coverage | Security regressions can recur until explicit adversarial matrix is written and checked before review | Add checklist extension as security-pre-review matrix; keep TDD/CR gates unchanged |
| PROC-NEW-2 | No direct contradictory text; only adjacent constraint: `devops` currently updates status on commit/release stages | Potential boundary overlap (devops vs QA ownership) | Unclear ownership can cause status drift and routing ambiguity | Scope PROC-NEW-2 as release-doc reconciliation step + evidence lint only; leave QA evidence generation to QA/UA chain |
| PROC-NEW-3 | `agents/pidex-planner.md`: `**MUST NOT define QA processes/test cases/QA requirements (pidex-qa's exclusive responsibility).` | Potential logical mismatch if interpreted as QA process requirement | Planner could overstep into QA domain or skip required proof visibility | Keep as plan acceptance artifact requirement in AC (what to prove + evidence to provide), not execution test plan |

## Risk Assessment
| Recommendation | Risk level | Rationale | Mitigation |
|---|---|---|---|
| PROC-NEW-1 | LOW | Adds explicit negative-case proofs before first handoff, aligns with current TDD constraints | Use existing mutation-route security checklists; implement as template row not hard gate logic |
| PROC-NEW-2 | MEDIUM | Changes status fields automatically could mask QA judgment if evidence mapping is wrong | Require dual proof keys: routing target + evidence file hash/line refs |
| PROC-NEW-3 | LOW | Planner acceptance clarity improves maintainability and repeatability of security-sensitive provider features | Keep scope to fixture-backed AC + `/limits` browser evidence, not hardcoded test scripts |

## Implementation Recommendations
### High-Impact, Low-Risk (implement first)
1) [🆕] pidex-implementer: add pre-review route-security matrix field for token/bind changes (spoofed Host, non-loopback write, public-bind) in plan handoff acceptance template.
2) [⚠️] pidex-devops: add QA-status/evidence reconciliation step before final route; reject mismatches as process defects.

### Medium-Impact or Medium-Risk
- [🆕] pidex-planner: include fixture-backed native-record AC row for `codex` + `codex-spark` and `/limits` browser-proof requirement as plan evidence criterion.

### Low-Impact or High-Risk (defer)
- [🆕] pidex-pi later pass: evaluate temporary QA Playwright dependency hygiene in dependency-policy/cleanliness doc stream if recurrence appears in next cycle.

## Suggested Agent Instruction Updates
No immediate file edits applied (approval to change instructions not requested).
Target change surface on approval:
- `rules/pidex-implementer/` + `rules/pidex-implementer/index.md` (new security matrix rule + index row)
- `rules/pidex-devops/` + `rules/pidex-devops/index.md` (status/evidence reconcile rule + index row)
- `rules/pidex-planner/` + `rules/pidex-planner/index.md` (fixture + `/limits` AC pattern rule + index row)
Validation plan: create rule files, keep agent `.md` immutable except optional reference lines if rule references are required by process; run doc-lint and route sanity checks.

## User Decision Required
1. approve-all — apply recommendations as new proc rules across implementer/devops/planner (two-tier).
2. defer — keep findings only, re-evaluate in next PI cycle.
3. reject — do not apply; retain as advisory notes only.

## Related Artifacts
- Retrospective: `agents.output/retrospective/4-provider-limits-native-retrospective.md`
- Brief: `agents.output/briefs/4-provider-limits-native-pi-brief.md`
- Retro routing: `agents.output/retrospective/4-provider-limits-native-retrospective.md`

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-roadmap
gate: none
reason: PI recommendations recorded; no agent instruction edits in this run.
post_retro_handoffs: pidex-planner,pidex-roadmap,pidex-architect
context_file: agents.output/pi/4-provider-limits-native-pi.md
-->
