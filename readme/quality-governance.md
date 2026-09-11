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

## Rule lifecycle provenance

Quality → **Rule lifecycle provenance** is read-only. It shows only allowlisted rule identity, tier, lifecycle state, accepted commit, activation epoch, protection, and bounded sync status. `Synchronized` means verified snapshot data; `Degraded` excludes affected managed rules; `Unavailable` renders no inferred provenance. No lifecycle/source/local-narrowing controls exist on this screen.

Package baseline verification uses `config/rule-baseline-manifest.json` plus exact shipped `agents/` and `rules/` bytes. It needs neither product-root `.git` nor writable package files.

## Living-rule publication boundary

Automatic learning is bounded: redacted eligible global/project finding → tier-isolated candidate → independent quorum → deterministic admission → exactly one managed-rule commit → ordinary fast-forward → verified receipt → mirror/projection/status. Manual refinement is a request under identical gates, never direct canonical editing. No per-rule approval, force push, rebase, amend, merge, or release action exists.

Exact publication statuses: `prepared`, `committed_local`, `accepted_remote`, `deferred_remote_advanced`, `rejected_policy`, `abandoned`. Recovery preserves terminal truth: attest exact remote receipt/descendant before mirror handoff; push only exact prepared ordinary fast-forward; otherwise defer changed remote, reject invalid policy/enrollment/tree, or record authorized abandonment. Local stop halts future candidate/publication/import work without rewriting history.

Enrollment limits repository identity, normalized remote/branch, scope/tier, managed paths, author/trailers, writer enablement, and stable filesystem identity. Operators use sanitized status plus enrollment/remote correction then fresh transaction. Raw evidence, prompts, source/log text, credentials, private paths, and global project identity never enter candidate, commit, status, API, dashboard, package, or public projection.

Package verification proves only shipped manifest schema, member hashes, aggregate digest, and separate package provenance; no `.git` or containing-commit provenance is claimed. Automatic adapters and manual refinement use source-owned authority; manual reads require stable Node handle/component reattestation. Native Windows remains a mandatory parity gate for identity/reparse boundaries, locks, atomic replacement, bytes, and recovery.

## Lifecycle action boundary

Deactivation/reactivation is automatic and reversible under the same no-rewrite rule: exact preserved rule bytes, one `pidex-action-cadence-v1` trailer, verified receipt, mirror plus projection. It never rewrites published history; epochs close and reopen only under verified active projections, and global projection heads carry the preserved manifest digest. Cross-host stop submits the canonical `deactivated` transition when active; local stop stays narrowing-only. `PIDEX_LIFECYCLE_ACTION_ENABLED` (default off) gates the single kill-switch seam; without an enrolled real adapter the action stays inert.

The ordinary Project Pipeline terminal path currently has **no enrolled canonical Impact Evaluation/current-state source connected to that seam**. It therefore reports `lifecycle_action: { status: "no_op", reason: "action_unavailable" }` when enabled for an otherwise eligible run; disabled or excluded runs retain their corresponding no-op reason. An exposure receipt is not an Impact Evaluation and cannot substitute for its bytes or authority. No action store is opened by this unavailable path. Pipeline completion describes project work, not successful rule deactivation. Connecting a real source/history adapter and proving operational behavior remains separate work; helper/fixture acceptance does not close that gap.

## Dashboard

Quality → **Manual contract governance** shows:

- pending proposals;
- exact manual run outcomes;
- manual correction history;
- an explicit inconclusive assessment for legacy labels that lack a baseline and post-apply evidence.

Settings exposes no governor activation, model, budget, hot-mode, or auto-apply controls. The governor API is read-only; POST returns HTTP `405` with `{ "ok": false, "code": "METHOD_NOT_ALLOWED", "error": "method-not-allowed" }`.

## Guardrails

- Public defaults are manual, pending-only, and non-spending.
- Local configs and all runtime outputs are excluded from public source/package scope.
- Existing or uncertain locks fail closed and are never automatically deleted.
- Dashboard SQLite is derived state; governance source records remain authoritative.
- Governor runs never mutate product code, rules, agents, skills, public defaults, pipeline events, or normal route-graph state.
