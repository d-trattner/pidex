# PIDEX Quality Phase 0

Read-only bootstrap for `/pdq`.

## Goals

- Produce descriptive PIDEX quality reports without running a full `/pd` pipeline.
- Introduce typed operator/orchestrator event schema.
- Detect expected-vs-observed trace gaps so skipped/unlogged operators are visible.
- Avoid one aggregate quality score as truth.

## Commands

Generate report:

```bash
node scripts/quality/report.mjs --project <pidex-root> --last 10
```

Review only plans not yet marked reviewed, then update cadence state:

```bash
node scripts/quality/report.mjs --project <pidex-root> --since-last-review --last 5 --update-review-state
```

Cadence state lives at `state/quality/review-state.json`.

Write/dry-run an operator event:

```bash
node scripts/quality/orchestrator-events.mjs \
  --pipeline-id demo \
  --plan plan-004 \
  --operator-type OpRoute \
  --logical-json '{"route_to":"pidex-qa"}' \
  --physical-json '{"route_to":"pidex-devops"}' \
  --dry-run
```

## Operator event minimum fields

- `timestamp`
- `project_path`
- `project_slug`
- `pipeline_id`
- `plan_key`
- `operator_type`
- `actor`

Important operators:

- `OpSpawn`
- `OpRoute`
- `OpGate`
- `OpContextPack`
- `OpUserCorrection`
- `OpRuleAction`
- `OpQualityReview`
- `OpReleaseDecision`
- `OpDecision`

Phase 2 notes:

- `OpRuleAction` is bridged from the rule-action ledger into PDQ operator facts.
- `OpContextPack` is emitted by `pidex_agent` as a skeleton context/task-size event before `OpSpawn`.
- `OpPreflight` is emitted by `/pidex`/`/pd` kickoff as a low-confidence skeleton before the interactive interview completes.
- `OpReview` is emitted by review-class agents (`pidex-critic`, `pidex-code-reviewer`, `pidex-security`, `pidex-qa`, `pidex-uat`) as a skeleton verdict/finding event.
- `OpQualityReview` is emitted by auto-PDQ after terminal pipeline events.
- `OpUserCorrection` is manual for now; do not infer corrections from arbitrary chat text.

Record a user correction manually:

```bash
node scripts/quality/orchestrator-events.mjs \
  --project <project-root> \
  --pipeline-id <pipeline-id> \
  --plan <plan-key> \
  --operator-type OpUserCorrection \
  --severity medium \
  --reason "User corrected route/status/evidence handling" \
  --logical-json '{"correction_type":"routing","expected_behavior":"pause at user gate"}' \
  --physical-json '{"actual_behavior":"continued to next agent","disposition":"accepted"}'
```

Record a release decision manually:

```bash
node scripts/quality/orchestrator-events.mjs \
  --project <project-root> \
  --pipeline-id <pipeline-id> \
  --plan <plan-key> \
  --operator-type OpReleaseDecision \
  --source-artifact agents.output/devops/<artifact>.md \
  --reason "User approved push/tag after clean validation" \
  --logical-json '{"release_action":"push-tag","approval_required":true,"approved_by":"user"}' \
  --physical-json '{"release_action":"push-tag","outcome":"completed","dirty_state":"clean"}'
```

## Rule-action ledger

Record a rule/process action without editing rules:

```bash
node scripts/quality/rule-actions.mjs add \
  --action monitor \
  --status monitoring \
  --owning-agent orchestrator \
  --approval-source user \
  --expected-impact-dimension routing-correctness \
  --expected-direction increase \
  --reason "Watch routing correctness after adding operator events"
```

List actions:

```bash
node scripts/quality/rule-actions.mjs list
```

Ledger entries include:

- `timestamp`
- `action`: add/remove/move/merge/split/compress/pin/monitor/rollback/downgrade/narrow/no-op
- `rule_path`
- `owning_agent`
- `approval_source`
- `expected_impact_dimension`
- `expected_direction`
- `token_delta_estimate`
- `linked_pipeline_id`
- `status`: accepted/rejected/deferred/monitoring/rolled-back

Phase 0 does not mutate rules. Ledger writes are explicit user/operator actions only.

## Operator decisions

Phase 3 records explicit operator decisions as `OpDecision` rows in the same orchestrator-event stream.
Use this when the operator intentionally skips, overrides, defers, accepts risk, backfills manual evidence, or corrects a PDQ expectation.

Record a valid preflight skip for a continuation pipeline:

```bash
node scripts/quality/operator-decisions.mjs record \
  --project <project-root> \
  --pipeline-id <pipeline-id> \
  --plan <plan-key> \
  --decision skip_step \
  --target-operator OpPreflight \
  --target-step preflight \
  --reason continuation-existing-plan \
  --approved-by operator \
  --risk-accepted false \
  --follow-up-required false \
  --evidence-path agents.output/planner/<artifact>.md
```

Record an auto-PDQ/manual backfill decision:

```bash
node scripts/quality/operator-decisions.mjs record \
  --project <project-root> \
  --pipeline-id <pipeline-id> \
  --plan <plan-key> \
  --decision manual_evidence \
  --target-operator OpQualityReview \
  --reason terminal-event-backfill \
  --approved-by operator \
  --risk-accepted false \
  --follow-up-required true
```

Valid decision reasons are finite and reportable; run `node scripts/quality/operator-decisions.mjs --help` for the current taxonomy.

## Operator contracts

Phase 3 starts with conservative contract helpers in `scripts/quality/operator-contracts.mjs`.
Current contract-backed classifications cover:

- `OpPreflight`: required after post-Phase-2B `pipeline_started`; valid skip reasons are `continuation-existing-plan` and `already-covered`.
- `OpQualityReview`: required after terminal pipeline events; valid skip/manual evidence reasons are `auto-pdq-disabled`, `optional-hooks-disabled`, `terminal-event-backfill`, and `report-logic-regeneration-pending`.
- `OpReview`: required after post-Phase-2B review-agent metric rows; valid skip/manual evidence reasons include `not-applicable`, `already-covered`, `docs-only`, `manual-review-done-outside-pidex`, `provider-quota-limited`, `operator-approved-risk`, and `duplicate-signal`.
- `OpGate`: required when a metric row contains a real gate; valid skip/manual evidence reasons include `not-applicable`, `already-covered`, `no-ui-change`, `manual-review-done-outside-pidex`, `operator-approved-risk`, and `expectation-wrong`.

When a matching `OpDecision` exists, PDQ reports a `valid_skip` finding, counts it as observed structured evidence, and excludes it from trace gap counts. Other operator expectations still use the legacy conservative classification until their contracts are added.
