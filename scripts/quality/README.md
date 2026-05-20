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
python3 scripts/quality/report.py --project <pidex-root> --last 10
```

Review only plans not yet marked reviewed, then update cadence state:

```bash
python3 scripts/quality/report.py --project <pidex-root> --since-last-review --last 5 --update-review-state
```

Cadence state lives at `state/quality/review-state.json`.

Write/dry-run an operator event:

```bash
python3 scripts/quality/orchestrator-events.py \
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

Phase 2 notes:

- `OpRuleAction` is bridged from the rule-action ledger into PDQ operator facts.
- `OpContextPack` is emitted by `pidex_agent` as a skeleton context/task-size event before `OpSpawn`.
- `OpPreflight` is emitted by `/pidex`/`/pd` kickoff as a low-confidence skeleton before the interactive interview completes.
- `OpReview` is emitted by review-class agents (`pidex-critic`, `pidex-code-reviewer`, `pidex-security`, `pidex-qa`, `pidex-uat`) as a skeleton verdict/finding event.
- `OpQualityReview` is emitted by auto-PDQ after terminal pipeline events.
- `OpUserCorrection` is manual for now; do not infer corrections from arbitrary chat text.

Record a user correction manually:

```bash
python3 scripts/quality/orchestrator-events.py \
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
python3 scripts/quality/orchestrator-events.py \
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
python3 scripts/quality/rule-actions.py add \
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
python3 scripts/quality/rule-actions.py list
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
