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
python3 scripts/quality/report.py --project /home/daniel/pidex --last 10
```

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
- `OpReleaseDecision`

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
