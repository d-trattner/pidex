---
ID: 4
Origin: 4
UUID: e8bb4ff3
Status: Complete
---

# PIDEX Quality Self-Improvement Analysis

## Changelog
- 2026-05-12: Completed quick feasibility/design pass.

## Value Statement and Business Objective
PIDEX needs quality loop that catches bad process/rule decisions before they become permanent rules, rework loops, and context bloat. System should improve itself from evidence, not vibes.

## Objective
Answer brief focus questions:
1. Feasibility of `/pdq` self-improvement loop with current data.
2. Smallest MVP that detects bad process/rule decisions.
3. Mandatory vs nice orchestrator events.
4. Scores to avoid due false confidence.
5. Risk-minimizing implementation order.
6. Safe use of historical Running Pi data.

## Context
Inspected:
- `agents.output/briefs/dashboard-orchestration-quality-metrics-epic.md`
- `config/agents.json`
- `skills/pd/SKILL.md`
- `scripts/metrics/record.sh`, `scripts/metrics/summarize.sh`
- `scripts/pipeline/event.sh`
- `dashboard-old/scripts/ingest.py`
- `dashboard/lib/server/api.ts`, `dashboard/routes/quality.tsx`
- `/home/daniel/running-pi/scripts/analysis/run-pipeline-analysis.sh`
- `/home/daniel/running-pi/scripts/token-log/parse-session.py`
- Current `state/metrics/**`, `state/pipeline-events/**`, `rules/**`, `agents.output/**`

Rules load note: required `/home/daniel/running-pi/rules/pidex-analyst/index.md` missing. No project-specific `agents.wiki.*/rules/pidex-analyst.md` found.

## Methodology
- Read current instrumentation contracts and sample state.
- Count current metric/event fields.
- Trace dashboard score source and ingest schema.
- Compare epic demands against observed data.
- Classify findings as Verified / High-confidence inference / Hypothesis.

## Findings

### Verified

#### Current PIDEX data can support descriptive `/pdq`, not causal rule learning yet
Evidence:
- `state/metrics/**`: 3 JSONL files, 117 records.
- Records cover every configured core agent at least once: planner, architect, implementer, code-reviewer, critic, security, qa, devops, designer, uat, retrospective, roadmap, analyst, pi.
- 74/117 metric records have `agent_verdict`; 74/117 have `route_to`; 37/117 have `gate`; 7/117 have nonzero exit.
- `extensions/pidex/index.ts` records `agent_verdict`, `route_to`, `gate`, `routing_reason`, `context_file`, `tool_count`, token/cache/cost estimates into metrics.
- `state/pipeline-events/**`: 14 files, 133 rows. Event types present: `pipeline_started`, `pipeline_stage_started`, `pipeline_stage_completed`, `pipeline_waiting`, `pipeline_completed`.
- Pipeline event metadata currently empty in all sampled rows (`metadata`: null). User correction / gate / routing details live mostly in free-text `message`.

Determination: `/pdq` feasible now as evidence index + descriptive health report. Harmful-rule detection feasible only as labelled watchlist with low/insufficient confidence until explicit rule-action and orchestrator decision events exist.

#### Existing dashboard already has partial quality substrate but score semantics are weak
Evidence:
- `dashboard/lib/server/api.ts` has `qualityChartData()` returning completion, agent verdicts, secondary health, merge classifications/dispositions, runtime by agent, gates, malformed trend, rework by pipeline, planner revisions, G9 by day.
- Same function returns `qualityImpactByDay: []` and `infraMarkers: {}`.
- `modelQuality()` computes `quality_score` from success, continuation, rejection, sigterm, token, cost heuristics. It treats `exitCode` incorrectly (`r.exitCode` camelCase check against DB row field `exit_code`), making null/undefined success logic fragile.
- `dashboard/routes/quality.tsx` consumes many fields but displays subset; UI already has data path for quality APIs.

Determination: dashboard can ingest/show `/pdq` reports with modest schema/API extension. Existing `quality_score` should not become authoritative rule-learning metric.

#### Current pipeline events are too coarse for orchestrator accountability
Evidence:
- `scripts/pipeline/event.sh` event schema: timestamp, project, pipeline, plan, event_type, status, actor, message, metadata.
- Direct-mode `/pd` instructions tell orchestrator to emit stage start/completion/waiting events, but no required typed fields for expected route, actual route, gate decision, context pack, user correction, or release approval.
- Sample G9 rejection appears as free text: `G9 rejected: quality charts not mobile compatible...`; no structured `gate_type`, `decision`, `reason`, `severity`, `affected_dimension`.

Determination: current data can count stages/rework, but cannot reliably decide if orchestrator routed correctly, paused correctly, or ignored a gate without parsing prose/artifacts.

#### Rule inventory exists; rule lifecycle data does not
Evidence:
- `rules/pidex-implementer/index.md` lists many active rules, including recent dashboard/G9/process rules.
- `rules/pidex-qa/index.md` has process-specific rules like browser evidence, status reconciliation, pre-CR UI proof.
- `rules/pidex-pi/index.md` has user-decision routing consistency.
- Git log for `rules/` currently shows one visible commit in this working tree (`feat: copy pidex rules and templates...`), with many untracked rule files. File mtimes/git are best effort only.

Determination: `/pdq` can inventory loaded rule count and token cost now. It cannot prove before/after rule impact until rule-action events or committed rule timeline exist.

#### Historical Running Pi assets are useful as pattern library, not mixed metrics
Evidence:
- Running Pi pipeline analysis script builds prompt bundles from metrics, history, artifacts, and implemented rule context. It asks for orchestration quality, user intent, routing, gates, rework loops, secondary lane value/noise, and harness improvements.
- Running Pi token parser extracts orchestrator usage and subagent usage from Claude session JSONL.
- PIDEX metrics intentionally filter non-Codex unless opt-in (`PIDEX_RECORD_ALL_PROVIDERS`, `PIDEX_INCLUDE_HISTORICAL_PROVIDERS`).

Determination: Running Pi data should seed labelled baseline heuristics and report templates only. It must not enter PIDEX-native top agent/model scoring.

### High-confidence Inference

#### Smallest MVP that detects bad process/rule decisions
MVP should not try universal quality score. It should detect concrete regressions:
1. Rework-loop spikes by agent/plan: repeated same agent after rejection/block/gate.
2. Gate false negative/positive proxies: user correction after approved gate; G9 rejection after UAT/QA approval; QA BLOCKED patched by orchestrator evidence.
3. Routing mismatch: artifact ROUTING `route_to` vs next stage event actor.
4. Rule/process action watchlist: new rule/process decision recorded with target dimension; compare next N relevant pipelines for same dimension using count metrics only.
5. Context bloat: rule index token/file count and pre-spawn/context-pack estimate trend where available.
6. Evidence gaps: missing ROUTING, missing context_file, missing browser proof when UI/G9 scope exists, empty metadata where mandatory event expected.

This catches bad decisions without pretending causality.

#### Mandatory orchestrator events for first useful `/pdq`
Mandatory typed events:
- `orchestrator_spawn`: pipeline_id, plan_key, agent, expected_output, focus, context_pack_path, estimated_tokens, model/provider, reason.
- `orchestrator_route`: source_artifact, expected_route_to, actual_route_to, gate_present, route_correct, severity, reason.
- `orchestrator_gate`: gate_type, source_artifact, user_decision_required, decision, decision_source, pause/resume timestamps, outcome route.
- `orchestrator_user_correction`: correction_type, severity, artifact/evidence path, target agent/process/rule.
- `orchestrator_rule_action`: action, rule_path, owning_agent, approval_source, expected_impact_dimension, token_delta estimate, linked pipeline.
- `orchestrator_context_pack`: context_pack_path, included_files count/list hash, estimated_tokens, budget warning.
- `orchestrator_release_decision`: release/push/tag intent, dirty-state summary, approval evidence.

Nice-to-have later:
- `orchestrator_preflight` ambiguity score/interview branches.
- `orchestrator_reconciliation` status contradiction details.
- UI-heavy/G9 reachability environment details.
- Rule duplicate/overlap fingerprints.
- Debug traces for artifact parser decisions.

#### Scores to avoid
Avoid as headline/decision scores:
- Single aggregate "agent quality score" mixing completion, cost, gates, and user corrections.
- Model `quality_score` as proof of better model/agent; current formula is heuristic and sample-size sensitive.
- Rule ROI score from before/after windows with <3 before + <3 after relevant pipelines.
- Token efficiency score without task complexity normalization.
- Completion rate as quality; bad runs can complete after user saves them.
- Rejection rate alone; good reviewers should reject bad work.
- Gate count as bad; correct gates protect user decisions.
- LLM-judged artifact quality without independent evidence.

Use labelled facts and dimension-specific indicators instead.

#### Risk-minimizing implementation order
Lowest-risk order:
1. Read-only `/pdq` collector over existing metrics/events/artifacts/rules. Emit JSON + markdown with gaps/confidence labels.
2. Typed orchestrator events at route/gate/spawn/context boundaries. Keep old pipeline events.
3. Dashboard/API ingest of `/pdq` JSON. Display facts, not quality badge.
4. Rule-action ledger + cadence state. Require user/PI approval linkage.
5. Regression detectors: routing mismatch, G9/user correction after approval, repeated rework, context growth without quality gain.
6. Historical Running Pi baseline import as external labelled data only.
7. Later: correlation windows and recommendation confidence once sample size exists.

Reason: each step produces useful evidence before scoring. Context bloat limited because `/pdq` reads summaries/JSON first, artifacts only by evidence link.

### Hypothesis

#### Hypothesis: most valuable first harm detector is "user correction after supposedly approved route/gate"
Confidence: Medium.
Fastest disconfirming test: Run `/pdq` over last 10 PIDEX pipelines after adding typed `orchestrator_user_correction` + `orchestrator_gate`; compare detected incidents against user memory/manual log.
Missing telemetry: structured user correction event with severity, target route/gate/rule, and linked artifact.

#### Hypothesis: context-bloat regressions will show before quality regressions
Confidence: Medium.
Fastest disconfirming test: Record context-pack token estimates for 5 runs and compare against rework/route mismatch/user correction trend.
Missing telemetry: mandatory `orchestrator_context_pack` and rule token delta per rule action.

## Root Cause
No verified RCA because this is feasibility/design analysis, not incident analysis.

## System Weaknesses
- Metrics are agent-run centered. Orchestrator decisions remain mostly invisible.
- Pipeline events are typed at lifecycle level but decision data sits in prose `message`.
- Rule changes lack durable ledger. Git/mtime unreliable in dirty/untracked working tree.
- Existing scores collapse many dimensions and can reward cheap completion over correct process.
- Historical provider/model data has contamination risk if imported without source labels.
- Artifact parsing can infer facts but cannot prove user approval, route correctness, or causality.

## Instrumentation Gaps

### Normal
Always-on, low-volume:
- Route decision event at every handoff with expected vs actual route.
- Gate event at every pause/resume with decision and source.
- Spawn event for every pidex_agent call with model/provider/context pack.
- Context pack event with estimated tokens and included file count.
- User correction event with severity and target.
- Rule action event with approval source, owner, expected impact, token delta.
- Release decision event with dirty-state and approval evidence.
- `/pdq` review-state with reviewed pipeline IDs and accepted/rejected/monitored recommendations.

### Debug
Opt-in, short-lived:
- Artifact parser trace: extracted ROUTING fields, status contradictions, confidence.
- Rule overlap/token diff trace.
- Full prompt/context pack file list.
- Detailed before/after correlation rows.
- Historical baseline import mapping trace.

## Analysis Recommendations
- Validate collector MVP against last 3 PIDEX pipelines and manually label user corrections/gates.
- Add tiny fixture corpus for metrics/events/artifacts before scoring work.
- Treat first `/pdq` output as `insufficient-data` unless detector has typed event evidence.
- Keep dashboard display factual: counts, trends, confidence labels, evidence links.
- Use Running Pi analysis script template sections as baseline taxonomy, not as imported metric rows.

## Open Questions / Remaining Gaps
- No current typed orchestrator events, so route/gate correctness cannot be proven automatically.
- No rule-action ledger, so rule harm cannot be attributed yet.
- No confirmed cadence UX for `/pdq --since-last-review` state transitions.
- No sample-size policy beyond brief defaults validated against current low PIDEX volume.
- No test fixtures inspected for future quality scripts because implementation not in scope.

<!-- ROUTING
verdict: COMPLETE
route_to: user
context_file: agents.output/analysis/pidex-quality-self-improvement-analyst.md
remaining_gaps:
  - typed orchestrator decision events absent
  - rule-action ledger absent
  - causal rule impact unprovable with current sample size
reason: Quick analyst feasibility/design pass complete; user should decide whether to revise brief or start planning.
-->
