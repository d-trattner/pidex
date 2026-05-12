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

## Rule-action ledger draft

Future rule ledger entries should include:

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

Phase 0 does not mutate rules or write rule ledger entries automatically.
