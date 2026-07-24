# Quality Governance

PIDEX quality governance is the PDQ subsystem for operator trace contracts, explicit operator decisions, and guarded local expectation corrections.

## What PDQ tracks

PDQ reports compare expected operator/process evidence with observed evidence from:

```text
<pidex-root>/state/metrics/**
<pidex-root>/state/pipeline-events/**
<pidex-root>/state/orchestrator-events/**
<pidex-root>/state/quality/**
```

Reports are written under `state/quality/` and `agents.output/quality/`. These are local runtime outputs and must not be committed.

## Operator contracts

Contracts define expected evidence for `OpPreflight`, `OpQualityReview`, `OpReview`, `OpGate`, `OpRoute`, `OpSpawn`, and `OpContextPack`. Findings include the contract ID, descriptive expectation, observed state, allowed explicit-decision reasons, and resolution options.

An explicit valid `OpDecision` counts as evidence. It does not silently rewrite historical metrics or events.

## Manual pending-only governor

The contract governor is a manual proposal generator. It is not a pipeline agent, background hook, model reviewer, validator, or auto-apply service.

Its public contract is:

```json
{
  "version": 2,
  "capability": "manual-pending-only",
  "max_proposals_per_run": 5
}
```

Run it explicitly against an existing report:

```bash
node scripts/quality/contract-governor.mjs run \
  --project <project-root> \
  --report <pdq-report.json> \
  --dry-run
```

Remove `--dry-run` only when you intend to record bounded pending proposals and a governance run record. Repeated semantically identical proposals retain one correction identity and do not append duplicate pending lifecycle rows.

The governor cannot:

- approve or apply a correction;
- write `config/operator-contracts.local.json`;
- invoke a model or delegate;
- run automatically after PDQ;
- emit `validated`;
- enter normal agent or pipeline metrics.

Legacy hot-mode, agent-review, auto-apply, evaluator, and model settings are unsupported and fail closed.

## Explicit operator approval

A separate operator command governs supported local overrides:

```bash
node scripts/quality/operator-contracts-admin.mjs propose ...
node scripts/quality/operator-contracts-admin.mjs approve ...
node scripts/quality/operator-contracts-admin.mjs supersede ...
```

Version 2 permits only `allowed_skip_reasons` for `OpPreflight` and `OpQualityReview`. `required_when` remains descriptive metadata and is not mutable. Pending, future-dated, rejected, superseded, malformed, or mismatched rows cannot weaken effective contracts.

Approved local overrides live in:

```text
config/operator-contracts.local.json
```

This file is private local state. Never commit or force-add it. Valid legacy version-1 prose patches are quarantined and inert until the operator explicitly supersedes them; malformed authority fails closed.

## Dashboard

Quality → **Manual contract governance** shows:

- pending proposals;
- exact manual run outcomes;
- manual correction history;
- an explicit inconclusive assessment for legacy labels that lack a baseline and post-apply evidence.

Settings exposes no governor activation, model, budget, hot-mode, or auto-apply controls. The governor API is read-only; POST returns `GOVERNOR_CONFIG_READ_ONLY`.

## Guardrails

- Public defaults are manual, pending-only, and non-spending.
- Local configs and all runtime outputs are excluded from public source/package scope.
- Existing or uncertain locks fail closed and are never automatically deleted.
- Dashboard SQLite is derived state; governance source records remain authoritative.
- Governor runs never mutate product code, rules, agents, skills, public defaults, pipeline events, or normal route-graph state.
