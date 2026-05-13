---
ID: 5
Origin: 5
UUID: 9d69c0f4
Status: Complete
---

# Paper 2605.03310v1 Coordination Layer PIDEX Analysis

## Changelog
- 2026-05-12: Completed analysis from extracted paper text, PIDEX quality epic, prior PIDEX analyst context.

## Value Statement and Business Objective
PIDEX quality loop needs evidence that separates orchestration effect from model/tool/context effect. Paper gives useful frame: coordination as explicit architectural layer, measured by failure signatures and cost-quality frontier. Business value: better `/pdq` detects bad orchestration/process choices without fake universal score.

## Objective
1. Summarize paper core claims and mechanisms.
2. Identify lessons for PIDEX architecture, orchestration, metrics, self-improvement.
3. Split immediate vs future/research ideas.
4. Identify risks/mismatches PIDEX should not copy.
5. Recommend quality epic and `/pdq` plan changes if any.

## Context
Inputs:
- `<home>/user-input/pdf/2605.03310v1.pdf`
- `agents.output/analysis/pdf-text/2605.03310v1.txt`
- `agents.output/briefs/dashboard-orchestration-quality-metrics-epic.md`
- `agents.output/analysis/closed/pidex-quality-self-improvement-analyst.md`

Rules load note: `<running-pi-root>/rules/pidex-analyst/index.md` missing. No project-specific `agents.wiki.*/rules/pidex-analyst.md` found.

## Methodology
- Read extracted paper text, with focus on claims, coordination spec, methodology, results, threats.
- Read PIDEX quality epic and prior analyst findings.
- Map paper constructs to PIDEX orchestration, metrics, and `/pdq` quality loop.
- Classify PIDEX lessons as immediate vs future/research.

## Paper Summary

### Core claim
Paper argues LLM multi-agent failures often come from coordination defects, not base-model capability. Coordination should be treated as separate architectural layer between information layer and agent layer.

Three layers:
1. Information layer: tools, retrieved context, data sources, external sensors.
2. Coordination layer: agent endpoints, message topology, authority, synchronization, aggregation, termination, failure handling.
3. Agent layer: per-agent LLM implementation, role prompts, wrappers.

Main methodological claim: compare coordination architectures only when information and agent layers stay fixed. Else, performance differences may be caused by richer context/tool access, not coordination.

### Mechanisms
Paper defines coordination layer by seven explicit elements:
- agent endpoints + input/output schemas
- communication topology
- authority distribution
- synchronization regime
- aggregation rules
- termination conditions
- failure handling policy

Paper studies five reference coordination patterns:
- Independent ensemble: parallel agents, aggregate outputs. Preserves diversity; can fail if correlated errors become confidently wrong consensus.
- Peer-critique debate: agents revise after seeing each other. Can improve calibration, but suppress dissent and reduce discriminative power.
- Orchestrator-specialist: planner decomposes, specialists answer, orchestrator integrates. Single-point orchestrator mistakes cascade.
- Sequential pipeline: fixed stages consume previous stage output. Early frame errors propagate downstream.
- Consensus alignment: agents iterate until disagreement shrinks. Diversity collapse, midpoint anchoring, low discrimination.

### Measurement approach
Paper uses prediction-market task because outcomes have external ground truth and proper scoring possible. It uses Brier score and Murphy decomposition:
- REL: reliability/calibration error, lower better.
- RES: resolution/discriminative power, higher better.
- Brier = UNC + REL - RES.

Important metric lesson: aggregate score can hide different failure signatures. Two systems can have same Brier but different calibration-vs-discrimination behavior.

### Empirical claims
Study runs five configurations on 100 post-training-cutoff Polymarket markets, one model, same tools, same prompt scaffold, same per-call cap. Total compute is endogenous: architecture is allowed to use its natural token/cost profile, then cost-quality frontier is reported.

Reported results:
- Three of five pre-specified Murphy-signature predictions upheld or partly upheld.
- Sequential pipeline best Brier but highest cost.
- Independent ensemble forms low-cost Pareto point.
- Orchestrator-specialist, peer-critique debate, consensus alignment dominated in this implementation/regime.
- No pairwise contrast survives Bonferroni at n=100; paper labels many findings exploratory.
- Consensus alignment most clearly separates as poor pattern, mostly via lower RES / diversity collapse.
- Category effects vary; sports had little architecture separation, economics much more.
- Authors explicitly avoid universal claims across models/domains/tool regimes.

## Verified Findings About PIDEX Relevance

### Coordination-layer framing fits PIDEX strongly
PIDEX already has distinguishable layers:
- Information: context packs, artifacts, rules, roadmap/wiki, metrics, user task, codebase reads.
- Coordination: orchestrator handoffs, gates, route selection, pidex role sequence, escalation, artifact routing, failure/retry policy.
- Agent: pidex-* prompts/rules/model/provider/tool behavior.

Current epic already targets typed orchestrator events and route/gate/context logging. Paper strengthens rationale: make coordination spec explicit not only for implementation clarity, but for measurable failure signatures.

### Information-fixing principle directly applies to `/pdq`
Paper’s warning maps to PIDEX quality metrics: do not compare agent or orchestration variants if context pack, tool access, model, prompt/rules, or task type changed uncontrolled.

PIDEX prior analyst already found current data supports descriptive reports, not causal rule learning. Paper reinforces: `/pdq` should label comparisons as uncontrolled unless it can show comparable information layer and agent layer.

### Cost should be architecture output, not nuisance only
Paper treats total tokens/cost as endogenous coordination output. PIDEX epic already includes token/cost efficiency and context bloat. Add interpretation: token/cost is part of coordination signature. Sequential patterns may cost more by design; orchestrator-heavy paths may re-send context. `/pdq` should report cost-quality frontier by workflow pattern, not only per-agent cost.

### Failure signatures should be pattern-specific
Paper’s strongest practical lesson: predict and measure failure by coordination pattern:
- sequential pipeline => upstream frame error / downstream elaboration
- orchestrator-specialist => single-point orchestrator cascade
- debate/review loops => dissent suppression or churn
- consensus/alignment gates => premature convergence / bland midpoint
- ensemble/parallel review => correlated blind spots if all agents share same context/model/rules

PIDEX quality epic currently lists dimensions and regression detectors. Add pattern-specific failure signatures to make `/pdq` explain why a metric matters.

### Multi-dimensional metrics beat one score
Paper’s Murphy decomposition mirrors prior PIDEX warning against universal quality score. For PIDEX, split dimensions such as:
- route correctness vs completion
- gate correctness vs gate count
- evidence sufficiency vs artifact length
- rework loops vs productive review
- context cost vs value
- user correction rate vs reviewer strictness

This supports epic’s “facts, confidence labels, evidence links” stance.

## Immediate Actionable Ideas For PIDEX

### 1. Add explicit coordination-spec inventory to `/pdq` MVP
For each pipeline/run, `/pdq` should reconstruct/report:
- topology: actual role sequence and branches
- authority: who made route/gate/final decision
- synchronization: sequential, parallel/secondary, review loop, user gate
- aggregation: whose artifact became final accepted basis
- termination: why pipeline ended or paused
- failure handling: retry, fallback, abort, supersede, user correction

This can start descriptive using existing metrics/artifacts; confidence low where typed events absent.

### 2. Add comparability labels before any trend comparison
Every `/pdq` comparison should state whether model/provider, task class, context/rules, tool access, and route topology are comparable. If not, label result “descriptive, not attribution.” This directly prevents architecture-information confound.

### 3. Convert quality epic regression detectors into failure signatures
Map detector to coordination pattern:
- routing mismatch => authority/provenance failure
- G9/user correction after approval => verification gap after authority decision
- repeated same-agent rework => termination/failure-handling weakness
- context growth without quality gain => information-layer expansion confound/cost leak
- malformed ROUTING => endpoint schema/failure-handling gap

### 4. Report cost-quality Pareto facts
For pipeline patterns or route templates, show:
- median tokens/cost/duration
- completion/rejection/user-correction rates
- evidence-gap rate
- dominated patterns: more cost and worse observed outcomes than simpler route for comparable task class

No universal score needed.

### 5. Preserve dissent evidence in review/gate loops
Paper warns debate/consensus can suppress minority signal. PIDEX should make `/pdq` detect when critic/security/QA/UAT concerns were overridden, softened, or absent from final artifact/routing. Immediate metric: “unresolved dissent carried to next stage?” from artifact findings + ROUTING.

### 6. Track upstream frame lock-in
Sequential pipeline risk maps to PIDEX: planner/architect assumptions can cascade into implementation, QA, UAT. `/pdq` should flag late user/QA correction whose root was present in early plan/architecture artifact. Initially manual/evidence-linked, later typed.

## Future / Research Ideas

### Controlled orchestration experiments
Run same task fixture through different PIDEX route templates while holding model, context pack, tools, and prompt/rules fixed. Compare failure signatures. Requires fixture corpus and deterministic-ish harness.

### PIDEX Murphy-like decompositions
Paper’s REL/RES are forecast-specific. PIDEX can borrow decomposition concept, not exact formula. Possible analogs:
- calibration: agent confidence/verdict vs downstream acceptance/user correction
- resolution: ability to discriminate easy vs risky tasks, route simple tasks cheaply and complex tasks deeply
- reliability gap: claimed Complete vs later blocked/rejected

Research only until enough typed evidence exists.

### Category-conditioned orchestration policies
Paper found architecture effects vary by domain. PIDEX could later evaluate route templates by task category: UI, security, infra, docs, refactor, data migration. Do not optimize until sample sizes exist.

### Power analysis for `/pdq` claims
Paper models required n before resolving pairwise differences. PIDEX should eventually require minimum sample sizes before claiming rule/agent/process improvement. Current epic says insufficient samples; paper provides stronger pattern.

### Live replication channel equivalent
For PIDEX, future analog is replay/eval fixture plus live pipeline monitoring. Historical artifact analysis alone not enough for causal architecture claims.

## Risks / Mismatches: What PIDEX Should NOT Copy

### Do not copy prediction-market metrics literally
Brier, Alpha, REL/RES are valid for probabilistic forecasts with external binary outcomes. PIDEX work has multi-step qualitative outcomes and user preferences. Use decomposition idea, not formula, unless task is explicit probability prediction.

### Do not overfit to five coordination patterns
PIDEX roles are not pure peer agents and often have governance constraints. Its route topology includes user gates, artifact contracts, security/QA obligations, and codebase state. Paper patterns are vocabulary, not PIDEX architecture menu.

### Do not assume sequential pipeline is best
Paper’s sequential pipeline performed best in one static-information prediction-market setup but highest cost and had cascade failures. PIDEX default sequential process exists for governance; do not cite paper as proof to deepen sequence or add stages.

### Do not hide negative results behind aggregate quality
Paper explicitly reports failed predictions and underpowered tests. PIDEX `/pdq` should do same: show “no claim” when evidence thin.

### Do not treat consensus as safety
Consensus can collapse diversity and suppress correct minority concern. PIDEX should not replace typed gates/review evidence with “agents agreed.” Agreement is not verification.

### Do not compare agents without controlling context/rules/tools
If one pidex agent got richer context, newer rules, or different model/provider, score difference is not agent quality. This is highest-risk mismatch with current PIDEX data.

## Recommended Changes To Quality Epic / `/pdq` Plan

### Add section: Coordination Layer Inventory
Insert under MVP or Orchestrator Event Logging:

`/pdq` records per pipeline: actual coordination topology, authority holder for route/gate/final acceptance, aggregation source, termination reason, failure-handling path. Report confidence based on typed events vs artifact inference.

### Add section: Comparability Guardrails
Before any agent/model/rule/process comparison, `/pdq` labels control status:
- model/provider same?
- task category comparable?
- tool access comparable?
- context pack/rules comparable?
- route topology comparable?
- sample size sufficient?

If false/unknown: descriptive only, no attribution.

### Add section: Failure-Signature Taxonomy
Extend regression detectors with coordination-specific signatures:
- authority cascade
- upstream frame lock-in
- dissent suppression
- verification gap after approval
- correlated blind spot across same-context agents
- termination/failure-handling loop

### Add cost-quality frontier language
Replace or supplement suggested scoring weights with Pareto reporting. Show dominated route patterns only when comparable task class and evidence dimensions align. Avoid weighted headline score as default.

### Add sample-size / power threshold note
For any `/pdq` recommendation claiming improvement/regression, require minimum sample threshold or label as hypothesis/watchlist. Prior analyst already recommended confidence labels; paper supports making this explicit.

### Add dissent preservation metric
Track unresolved high-severity findings from critic/security/QA/UAT and whether final route/artifact addressed, deferred with approval, or silently dropped.

## Root Cause
No incident RCA. This is paper-to-PIDEX applicability analysis.

## System Weaknesses Highlighted By Paper
- Coordination choices currently implicit in event prose/artifact sequence, not first-class comparable spec.
- Information-layer changes can masquerade as agent/process improvement.
- Existing quality-score tendency risks collapsing different failure modes.
- Review/gate agreement can hide dissent suppression.
- Sequential governance can propagate early bad assumptions if late agents verify outputs only locally.

## Instrumentation Gaps

### Normal
- Typed coordination-topology summary per pipeline.
- Authority/provenance field for each route/gate/final acceptance.
- Context comparability metadata: context pack ID/hash, rule set version/hash, tool access, model/provider.
- Dissent lifecycle: finding raised, addressed/deferred/dropped, approval source.
- Termination/failure-handling reason: complete, blocked, retry, superseded, fallback, user stop.
- Task category label for stratified quality reports.

### Debug
- Artifact-inference trace for reconstructed topology.
- Context diff between compared runs.
- Rule/context token delta attribution.
- Manual adjudication fixture for calibration of `/pdq` detector accuracy.

## Analysis Recommendations
- Update epic with coordination-layer inventory, comparability guardrails, failure-signature taxonomy, Pareto reporting, and dissent lifecycle tracking.
- Keep Phase 1 `/pdq` descriptive. Label attribution unavailable where information/agent layers changed.
- Use paper as rationale for typed orchestrator events and against universal quality score.
- Defer controlled route-template experiments until fixture corpus and typed events exist.

## Open Questions / Remaining Gaps
- Did not inspect current `/pdq` implementation code, if any; task scoped to epic/plan recommendation.
- Did not validate PDF against extracted text byte-for-byte; analysis used provided extracted text.
- No empirical PIDEX run data re-analysis performed for paper-derived signatures.

<!-- ROUTING
verdict: COMPLETE
route_to: user
context_file: agents.output/analysis/paper-2605.03310v1-coordination-layer-pidex-analysis.md
remaining_gaps:
  - Did not inspect current `/pdq` implementation code, if any.
  - Did not validate PDF against extracted text byte-for-byte.
  - No empirical PIDEX run data re-analysis performed for paper-derived signatures.
reason: PDF analysis complete.
-->
