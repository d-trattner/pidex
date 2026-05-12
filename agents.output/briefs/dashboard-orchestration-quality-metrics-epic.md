# Future Epic: PIDEX Quality Measurement + Rule Learning Loop

Build a PIDEX quality system that measures quality for every participant in a pipeline, including the host orchestrator and every `pidex-*` subagent, then uses that evidence to maintain rules/skills without causing context bloat.

## Product Goal
PIDEX should answer: “Did this agent/orchestrator decision improve pipeline quality, and did a newly added rule help or hurt later outcomes?” The system should support literal continuous self-improvement: after every configurable number of completed pipeline runs, PIDEX reviews its own performance, identifies what changed, proposes safe process/rule improvements, and also detects bad improvement decisions that looked promising but degraded quality later. The system should correlate agent quality, orchestrator quality, gate/rejection outcomes, rule additions/removals/moves, and prompt/context size over time. It should produce evidence-backed suggestions such as add a rule, remove a rule, move a rule to a narrower agent, merge duplicate rules, compress a bloated rule, rollback a harmful rule, or retire a rule that no longer improves outcomes.

## New Skill
Add a new skill:

- Skill name: `pidex-quality`
- Invocation: `/pdq`
- Purpose: inspect PIDEX metrics/artifacts/rules and produce measured quality reports plus recommended actions.

The skill should be analysis-first, not an automatic mutator. It may generate candidate rule-maintenance artifacts, but rule edits still require user/PI approval. It should support a cadence mode, e.g. `/pdq --since-last-review` or `/pdq --last 10`, so PIDEX can run a self-improvement review after every X completed pipelines.

## Data Sources
Use PIDEX-native data first:

- `state/metrics/**.jsonl` for per-agent runs, model/provider, token/cost, verdict, route, duration, exit code, continuation/fallback signals.
- `state/runs/**` for raw subprocess/session outcomes and orchestrator handoff traces where available.
- `state/pipeline-events/**.jsonl` for pipeline timeline, gates, status changes, actors, and user interruptions.
- `agents.output/**` for planning/code-review/security/QA/UAT/devops/retrospective/PI artifacts.
- `rules/**/index.md` and individual rule files for rule inventory, rule age, owning agent, and rule-change timeline.
- Git history or file mtimes as best-effort rule-change timestamps when available.

Historical Running Pi data may be used only as explicit baseline/migration input. It must be labelled as external/baseline and must not contaminate PIDEX-native top-model/top-agent metrics.

## Analyst Findings Fold-In
Source analysis: `agents.output/analysis/pidex-quality-self-improvement-analyst.md`.

Planner/implementer must treat these findings as guidance for scope control:

- Current PIDEX data supports descriptive `/pdq` reporting now, but not causal rule-learning yet.
- True self-improvement requires two missing primitives:
  - typed orchestrator decision events
  - a rule-action ledger with approval source and expected impact
- Avoid presenting one big “quality score” as truth. Use dimension-specific facts, confidence labels, and evidence links.
- Existing dashboard/model `quality_score` is heuristic and must not be used as authoritative proof that a model/agent/rule is better.
- First implementation should produce useful facts before attempting causal scoring or dashboard badges.

## Planned Implementation Steps
1. Fold analyst findings into this epic brief. ✅ Done.
2. Phase 1 MVP: implement read-only `/pdq` collector/report over existing metrics/events/artifacts/rules.
3. Add typed operator/orchestrator event schema and low-volume logging for spawn, route, gate, context, user correction, rule action, and release decision.
3a. Add expected-vs-observed operator trace reconstruction so skipped/unlogged operators are detectable.
4. Add rule-action ledger schema so accepted/declined/deferred rule changes can be tracked with expected impact and approval source.
5. Emit both machine-readable JSON under `state/quality/` and human-readable markdown under `agents.output/quality/`.
6. Add cadence state for “review every X completed pipelines”.
7. Add first regression detectors: routing mismatch, harmful gate/user-correction patterns, rework-loop spikes, context growth without quality gain.
8. Only after data shape is stable, extend dashboard/API to visualize facts/trends/confidence labels.
9. Later, add before/after correlation windows and rollback/downgrade/narrow recommendations when sample size is sufficient.

## Prior Art to Reuse
Reuse/adapt existing Running Pi/PIDEX building blocks instead of inventing from scratch:

- PIDEX metrics/dashboard plumbing: `scripts/metrics/record.sh`, `scripts/metrics/summarize.sh`, `state/metrics/**`, `state/pipeline-events/**`, dashboard `agent_runs`/`pipeline_events`/quality APIs.
- Running Pi analysis prior art: `/home/daniel/running-pi/scripts/analysis/run-pipeline-analysis.sh` already analyzes orchestration quality, intent capture, routing, gates, evidence timing, rework loops, secondary lane value/noise, existing harness coverage, and harness improvement candidates.
- Running Pi token/context prior art: `/home/daniel/running-pi/scripts/token-log/parse-session.py` extracts orchestrator and subagent token usage and can inform context-bloat scoring.

The PIDEX implementation should turn these ideas into structured JSON + dashboard data, not only markdown reports.

## MVP Boundary
Phase 1 must stay intentionally narrow:

In scope:

- `/pdq` skill entrypoint and read-only quality report.
- Existing-data collector for metrics, pipeline events, artifacts, and rules.
- Typed schemas for operator/orchestrator events and rule-action ledger.
- Expected trace builder and observed trace gap detector.
- Confidence-labelled findings, not claims of causality.
- Evidence links for every recommendation.

Out of scope for Phase 1:

- automatic rule edits
- dashboard-first implementation
- universal quality badge/score as truth
- causal rule ROI with insufficient samples
- importing Running Pi metrics into PIDEX-native stats

## Quality Dimensions
### Subagent quality
Reuse and extend existing dashboard metrics:

- success/completion rate
- rejection rate and severity
- continuation/fix-loop count
- gate timing correctness
- QA/security finding escape rate
- artifact routing validity
- malformed ROUTING rate
- token/cost efficiency
- time-to-completion
- repeated failure patterns by agent/rule/model

### Orchestrator quality
Measure the host/orchestrator too:

- pre-flight clarity: ambiguous task detection, correct grill/interview use
- routing correctness: did next agent match artifact ROUTING and gate state?
- gate discipline: paused for user when required, no silent auto-continue on decisions
- context discipline: avoided reading huge artifacts unnecessarily, used compact briefs
- UI-heavy detection: routed to designer/previews before implementation when needed
- G9/browser reachability discipline
- QA status reconciliation discipline
- release hygiene: no push/tag without approval, clean dirty-state reporting
- intervention count: user had to correct route/status/data contamination

Suggested initial scoring weights:

- 25% routing correctness
- 20% gate/user-decision discipline
- 15% context efficiency
- 15% pre-flight clarity
- 10% status/evidence reconciliation
- 10% user correction rate
- 5% rule-learning hygiene

## PIDEX Operator/Event Model
Adopt an operator/event abstraction for orchestration measurement. Treat every meaningful orchestration step as a typed operator with explicit inputs, outputs, expected behavior, actual behavior, and evidence.

Initial operator vocabulary:

- `OpPreflight` — clarify task, classify scope, decide whether grill/design preflight is needed.
- `OpContextPack` — choose context/rules/files/artifacts, estimate tokens, detect budget warnings.
- `OpSpawn` — launch `pidex-*` agent with objective, focus, model/provider, expected output.
- `OpRoute` — compare artifact `ROUTING`/gate expectation to actual next step.
- `OpGate` — pause/resume for user/PI/G9/release decision.
- `OpReview` — code-review/security/QA/UAT finding or verdict stage.
- `OpUserCorrection` — user corrected orchestrator, data, status, route, or process decision.
- `OpRuleAction` — add/remove/move/compress/pin/monitor rule or process change.
- `OpQualityReview` — `/pdq` cadence self-review over last N pipelines.
- `OpReleaseDecision` — push/tag/release decision with dirty-state and approval evidence.

Core design rule:

- `logical_decision` records what artifact/rule/gate/template says should happen.
- `physical_action` records what orchestrator actually did.
- `/pdq` compares them and reports mismatches by dimension, not as one global score.

## Orchestrator Event Logging
Add explicit orchestrator event logging so `/pdq` can use hard evidence instead of guessing from artifacts only.

Suggested event file:

- `state/orchestrator-events/<project-slug>/<pipeline-id>.jsonl`

Suggested event types:

- `orchestrator_preflight` — task clarity, questions asked, grill/design preflight triggered/skipped, ambiguity score.
- `orchestrator_context_pack` — brief path, source paths included, estimated tokens, rule files loaded, budget warnings.
- `orchestrator_spawn` — agent spawned, provider/model override, expected output, focus, reason.
- `orchestrator_route` — source artifact, expected `route_to`, actual next route, gate present, correctness result.
- `orchestrator_gate` — gate detected, gate type, user decision required, user decision received, pause/resume timestamps.
- `orchestrator_reconciliation` — status contradiction detected/resolved, e.g. QA PASS vs missing browser evidence.
- `orchestrator_user_correction` — user corrected orchestrator/data/status/routing; severity and evidence.
- `orchestrator_release_decision` — release/push/tag decision, dirty-state summary, approval evidence.
- `orchestrator_rule_action` — rule added/removed/moved/compressed/pinned/reviewed; linked PI/user approval.

Example JSONL row:

```json
{
  "timestamp": "2026-05-12T18:00:00Z",
  "project_path": "/home/daniel/pidex",
  "pipeline_id": "4-dashboard-parity-mobile-projects",
  "event_type": "orchestrator_route",
  "from_agent": "pidex-qa",
  "source_artifact": "agents.output/qa/4-dashboard-parity-mobile-projects-qa.md",
  "expected_route_to": "user",
  "actual_route_to": "pidex-devops",
  "gate_present": true,
  "correct": false,
  "severity": "high",
  "reason": "QA artifact had blocked/user gate but orchestrator continued to devops."
}
```

First increment should log events opportunistically from the `/pd` skill/orchestrator flow and infer missing historical events best-effort from artifacts. Future increments can make event logging mandatory at every route/gate/spawn boundary.

## Expected-vs-Observed Operator Trace
`/pdq` must not blindly trust event logs. If the orchestrator skips logging an operator, that absence must itself be detectable.

Add an expected trace builder and observed trace reader:

- Expected operators are inferred from:
  - `/pd` pipeline template and known route order
  - artifact `ROUTING` blocks
  - `gate:` fields
  - `pidex_agent` calls/session logs
  - `state/pipeline-events/**`
  - known required gates/rules
  - task classifiers, e.g. UI-heavy implies designer/G9 operators
- Observed operators come from `state/orchestrator-events/**/*.jsonl` plus fallback evidence.
- `/pdq` compares expected vs observed and reports gaps with confidence labels.

Failure classes:

- `missing_operator` — required operator absent from event log/evidence.
- `skipped_operator` — later step happened but required prior step missing.
- `unlogged_operator` — evidence suggests operator happened, but no structured event exists; instrumentation debt.
- `invalid_sequence` — operators exist but order violates route/gate/release policy.
- `contradictory_operator` — structured event conflicts with artifact/status evidence.

Example: if planner artifact says `route_to: pidex-critic`, expected trace includes `OpRoute(planner -> critic)` and `OpSpawn(pidex-critic)`. If devops starts without a required G9 approval, `/pdq` should flag `skipped_operator: OpGate(G9)`.

Trace completeness indicators:

- required operators expected
- required operators observed
- missing/skipped/unlogged count
- critical missing operators
- invalid sequence count
- contradictory operator count

Important rule: missing logs are not automatically agent failure. They are orchestrator/instrumentation gaps unless artifact evidence proves the operator truly happened incorrectly.

Confidence labels:

- `confirmed-missing`
- `probably-unlogged`
- `contradictory`
- `insufficient-data`

This prevents the system from hiding bad orchestration by simply failing to log the bad decision.

## Coordination-Spec Inventory
From the coordination-layer paper, `/pdq` should treat coordination as its own architectural layer and describe it explicitly for each pipeline.

For every reviewed pipeline, record/report:

- `topology` — sequential, branch, parallel/secondary, review loop, retry loop.
- `authority` — who made route/gate/final decisions: orchestrator, agent ROUTING, user, PI, devops, etc.
- `synchronization` — gate, wait, merge, retry, parallel join, user decision pause.
- `aggregation` — whose artifact/output became canonical after review/merge.
- `termination` — completed, blocked, aborted, superseded, waiting, released, local-only.
- `failure_handling` — retry, fix loop, rollback, defer, ask user, route to PI, no-op.

This makes route patterns comparable without claiming universal quality.

## Comparability Labels
Before claiming that a rule/process/model/route improved or degraded quality, `/pdq` must label whether compared runs are actually comparable.

Check at least:

- task class/scope comparable
- model/provider/profile comparable
- context/rule set comparable
- route topology comparable
- tool access/environment comparable
- sample size sufficient

If these are not satisfied, label result as `descriptive-only` or `insufficient-data`, not causal.

## Coordination Failure Signatures
Report pattern-specific failure signatures instead of generic “bad quality”:

- sequential pipeline: early planning/frame error cascaded downstream
- orchestrator-specialist: orchestrator decision cascaded failure or suppressed specialist signal
- debate/review loop: dissent suppressed, ignored, or churned without decision
- consensus/alignment: watered-down midpoint, lost strong critique, diversity collapse
- parallel/secondary: correlated blind spots, duplicate noise, malformed/unused secondary artifacts
- gate-heavy flow: false-positive gates interrupt user without value, or false-negative gates miss blockers
- context-heavy flow: context/rule expansion increases tokens without reducing rework/corrections

## Dissent Preservation
If critic/security/QA/UAT/secondary lane raises a concern, `/pdq` should preserve its lifecycle:

- concern raised
- severity/source/evidence
- accepted/deferred/rejected/overridden
- who made the disposition
- whether later events validated or contradicted the disposition

This helps identify bad consensus, bad orchestrator override decisions, and ignored minority signals.

## Cost-Quality Pareto Facts
Report cost/tokens/duration as part of the coordination signature, not as a nuisance metric.

For comparable task classes or route templates, show:

- median tokens/cost/duration
- evidence-gap rate
- user-correction rate
- rejection/fix-loop rate
- route/gate mismatch rate

Flag dominated patterns only when evidence supports it: a pattern costs more and has worse or no-better observed outcomes than a simpler comparable pattern.

## DAG Compiler Deferred
A future DAG compiler could turn plans into executable/checkable operator graphs with dependencies and parallel branches. Defer this until operator events, expected trace reconstruction, and rule-action ledger are stable.

For Phase 1, build only a lightweight expected trace builder, not a full DAG compiler.

## Rule Correlation
Track rule lifecycle and correlate with later quality:

- rule added/changed/removed/moved timestamp
- owning agent and loaded index position
- expected behavior the rule targets
- before/after metrics for relevant pipelines
- confidence score for whether rule improved, degraded, or had no measurable effect
- context-cost impact: added tokens, duplicate overlap, load frequency

The system should identify likely causes, not claim certainty when evidence is weak.

## Self-Improvement Cadence
Add a configurable review cadence so PIDEX can improve itself after every X completed pipeline runs.

Suggested state/config:

- `state/quality/review-state.json` — last reviewed pipeline/event timestamp, reviewed pipeline IDs, accepted/rejected recommendations.
- `config/quality.json` — review cadence, confidence thresholds, before/after window size, minimum sample size.

Suggested defaults:

- Review every 5 completed pipelines for early PIDEX development.
- Require minimum 3 before + 3 after relevant samples before claiming a rule improved/degraded quality.
- If sample size is too small, emit `MONITOR` rather than `ADD/REMOVE/ROLLBACK`.

Each review should produce:

- a machine-readable report under `state/quality/`
- a human-readable report under `agents.output/quality/`
- candidate rule/process actions for PI/user approval
- a record of actions accepted, rejected, deferred, or monitored

## Bad Decision / Harm Detection
The system must identify when a supposed improvement made PIDEX worse.

For every accepted rule/process change, track expected impact and later actual impact. Flag negative outcomes such as:

- quality score drops after rule adoption in the affected dimension
- rejection/fix-loop rate increases for the owning agent
- gate false positives increase, causing unnecessary user interruptions
- gate false negatives increase, causing missed blockers
- context tokens increase without quality gain
- duplicate/overlapping rules increase confusion or contradiction rate
- user corrections increase after the change
- elapsed time/cost increases without better outcomes

Recommended actions for harmful or weak changes:

- `ROLLBACK`: remove or revert a rule/process change with negative confidence.
- `DOWNGRADE`: change mandatory rule to advisory/checklist.
- `NARROW`: move broad/global rule to a specific agent or trigger condition.
- `MERGE/COMPRESS`: reduce context bloat while preserving useful behavior.
- `A/B-MONITOR`: keep rule temporarily but compare affected vs unaffected runs.
- `NO-OP`: explicitly record that a tempting improvement is not supported by evidence.

Every recommendation must include evidence links and confidence level: `high`, `medium`, `low`, or `insufficient-data`.

## Scores and Claims to Avoid
Avoid these as headline truth metrics:

- single aggregate “agent quality score” mixing completion, cost, gates, and corrections
- model `quality_score` as proof of better model/agent/rule
- rule ROI from before/after windows with fewer than 3 before and 3 after relevant samples
- token efficiency without task complexity normalization
- completion rate as quality
- rejection rate alone as bad, because good reviewers should reject bad work
- gate count as bad, because correct gates protect user decisions
- LLM-judged artifact quality without independent evidence

Preferred framing:

- factual indicators
- dimensions, not one score
- trend direction
- sample size
- confidence label
- evidence links
- explicit `insufficient-data` when needed

## Rule Maintenance Actions
`/pdq` should recommend actions:

- ADD: repeated failure has no current rule coverage
- REMOVE: rule adds context but no longer correlates with improvement
- ROLLBACK: a previous improvement decision appears to have degraded quality
- MOVE: rule belongs in narrower agent index, not global/orchestrator context
- MERGE: duplicate or overlapping rules can be condensed
- SPLIT: broad rule causes noise; make focused agent-specific rules
- COMPRESS: keep behavior but reduce token footprint
- PIN: rule appears high-value; keep and protect from cleanup
- MONITOR/A-B: collect more data before changing behavior
- REVIEW: insufficient data; ask PI/user to inspect

## Scripts / CLI
Add scripts usable by `/pdq` and dashboard ingestion:

- collect quality facts from metrics, pipeline events, orchestrator/operator events, artifacts, and rules
- calculate per-dimension indicators; optional aggregates only if labelled heuristic
- calculate orchestrator indicators from explicit events, expected-vs-observed trace gaps, and artifact fallbacks
- build rule timeline
- correlate rule changes with before/after quality windows
- detect harmful improvement decisions and produce rollback/downgrade/narrow recommendations
- track cadence state so `/pdq` can review every X completed pipelines
- emit JSON report for dashboard/API
- emit markdown recommendation report for PI/user review

Suggested paths:

- `scripts/quality/collect.py`
- `scripts/quality/score.py`
- `scripts/quality/rules.py`
- `scripts/quality/report.py`
- `scripts/quality/orchestrator-events.py`
- `scripts/quality/operator-trace.py`
- `state/orchestrator-events/**/*.jsonl`
- `state/quality/*.json`
- `agents.output/quality/*.md`

## Dashboard Additions
Extend dashboard with a quality/rules view:

- per-agent quality table
- orchestrator quality row
- trend charts over time
- rule-change markers overlaid on quality charts
- context-bloat indicators per agent/rule index
- recommendation list with evidence links

## Acceptance Criteria
- `/pdq` skill exists and can produce a quality report without starting a full implementation pipeline.
- Reports include every `pidex-*` subagent plus the orchestrator.
- Orchestrator route/gate/spawn/context events are logged to PIDEX-native JSONL for new runs.
- `/pdq` can detect missing/skipped/unlogged operators by comparing expected and observed traces.
- Reports include rule-maintenance recommendations with evidence and confidence.
- `/pdq` supports cadence review after every configurable X completed pipeline runs.
- Reports can identify harmful process/rule changes and recommend rollback/downgrade/narrow/monitor actions.
- PIDEX-native dashboard/API can ingest quality JSON.
- Dashboard shows agent/orchestrator quality and rule-change correlations.
- Historical Running Pi data is explicitly labelled if used and cannot pollute PIDEX-native top-model/top-agent stats.
- Tests cover operator trace gap detection, rule timeline extraction, and correlation logic.
- Browser evidence proves dashboard quality/rule views work on desktop and mobile.

## Out of Scope for First Increment
- Fully automatic rule edits without user/PI approval.
- Perfect causal inference.
- Predictive model selection.
- Cross-repo federation beyond explicitly labelled external baseline data.
- Retroactive complete scoring for all historical runs beyond best-effort backfill.
