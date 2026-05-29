# Quality Governance

PIDEX quality governance is the PDQ subsystem for operator trace contracts, expectation corrections, and guarded local rule learning.

## What PDQ tracks

PDQ reports compare expected operator/process evidence with observed evidence from:

```text
<pidex-root>/state/metrics/**
<pidex-root>/state/pipeline-events/**
<pidex-root>/state/orchestrator-events/**
<pidex-root>/state/quality/**
```

Reports are written to:

```text
<pidex-root>/state/quality/
<pidex-root>/agents.output/quality/
```

The dashboard Quality page shows trace gaps, valid operator decisions, violated contracts, freshness, next actions, trends, and background governance status.

## Operator contracts

Operator contracts define when PIDEX expects structured evidence such as:

- `OpPreflight`
- `OpQualityReview`
- `OpReview`
- `OpGate`
- `OpRoute`
- `OpSpawn`
- `OpContextPack`

A missing expected event becomes a contract-backed finding with:

- `contract_id`
- expected condition
- observed state
- allowed skip/manual-evidence reasons
- resolution options

Valid explicit operator decisions are counted as evidence and are not treated as generic missing instrumentation.

## Contract governor

The background contract governor reviews low-risk contract-correction proposals. It is not a normal `/pidex` pipeline agent and does not participate in the route graph.

Public defaults are safe and disabled:

```text
config/contract-governor.json
```

Local/operator overrides, if used, live in:

```text
config/contract-governor.local.json
```

Do not commit local governor config or local operator-contract overrides.

## Hot mode

Hot mode is development-only. Low-risk auto-apply requires both:

```json
{
  "hot_mode": true,
  "auto_apply": "low-risk"
}
```

If either is missing, proposals remain pending/report-only. The dashboard Settings page shows Quality Governance controls and warns when hot mode is active.

## Local operator-contract overrides

Approved local contract corrections are written to:

```text
config/operator-contracts.local.json
```

This file is private/local state and must not be committed.

## Evaluation and monitoring

Applied corrections enter a monitoring lifecycle and can be evaluated with:

```bash
node scripts/quality/contract-governor.mjs evaluate \
  --project <project-root> \
  --correction-id <id> \
  --last-reports 5
```

Evaluator results can mark corrections as validated, needing review, or rollback-recommended. PIDEX does not silently roll back corrections in the current release.

## Dashboard

Quality governance appears in two places:

- **Quality → Background governance**: status, pending proposals, approved/validated corrections, rollback recommendations.
- **Settings → Quality Governance**: local enabled/mode/model/budget/hot-mode settings.

## Guardrails

- Public defaults remain disabled and non-spending.
- Local overrides are ignored by public-readiness checks if untracked, and fail public readiness if tracked.
- The governor writes only governance artifacts/state and local overrides.
- The governor must not mutate product/source code, rules, skills, public defaults, or normal route graph state.
