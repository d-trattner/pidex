# PIDEX Quality Phase 0

Read-only bootstrap for `/pdq`.

## Rule lifecycle baseline

`node scripts/quality/rule-lifecycle.mjs read --root <pidex-root>` verifies shipped protected baseline bytes from `config/rule-baseline-manifest.json`. It is read-only: no Git checkout, package write, lifecycle action, or mirror repair. Missing or mismatched baseline fails closed.

`/quality` shows **Rule lifecycle provenance** as read-only status. `Synchronized`, `Degraded`, and `Unavailable` never expose source bytes, paths, DB details, or lifecycle controls. Unavailable projection stays empty; it never infers managed state.

## Living-rule publication

Automatic project/global learning follows one narrow path: eligible redacted finding → tier-isolated candidate → independent semantic quorum → deterministic admission → one managed-rule commit → ordinary fast-forward → verified receipt → Plan045 mirror, projection, and publication status. Global evidence stays cross-scope; project evidence stays enrolled exact-project only. Generator never votes.

Manual refinement is an authenticated request plus stable read, not direct edit authority. It enters same privacy, protection, quorum, transaction, receipt, and recovery gates. There is no per-rule approval, direct canonical write, force-push, rebase, amend, merge, or release action.

Publication states are exact: `prepared` (TX-01), `committed_local` (TX-02), `accepted_remote` (TX-03), `deferred_remote_advanced` (TX-04), `rejected_policy` (TX-05), and `abandoned` (TX-06). Recovery preserves terminal state: verify accepted remote descendant/receipt first; otherwise push only exact prepared fast-forward base, defer remote advance, reject invalid enrollment/tree, or record authorized abandonment. Local stop disables future generation/publication/import; it never rewrites published history.

Enrollment binds repository identity, remote, branch, tier/scope, managed paths, author/trailers, writer enablement, and filesystem identity. Operators recover by inspecting sanitized status and resolving enrollment/remote facts before a fresh transaction. Do not expose prompts, source/log text, credentials, private paths, project identity in global tier, or raw errors; retain only allowed categories/counts/digests.

Package verification has no Git claim: it verifies shipped manifest schema, member hashes, aggregate digest, and separate package provenance only. Manual-refinement reader uses Node stable handle/component reattestation; missing or ambiguous Windows identity fails closed. Native Windows is a required fail-closed parity gate for identity, path/reparse handling, lock/atomic-write behavior, exact bytes, and recovery; Linux evidence does not substitute.

## Lifecycle action

Automatic reversible lifecycle action (deactivation/reactivation) is the same no-rewrite writer discipline: exact preserved rule bytes → one `pidex-action-cadence-v1` trailer commit → verified accepted receipt → mirror plus projection with prior epoch closed and fresh epoch only on a verified active projection. Global projection heads carry the preserved manifest bytes digest; nothing synthetic enters the truth surface. Cross-host stop submits the canonical `deactivated` transition when active; local stop stays narrowing-only and is never canonical. Kill switch `PIDEX_LIFECYCLE_ACTION_ENABLED` (default off) is the single seam across host, tracer, and orchestrator; without an enrolled real adapter the action stays inert (`cadence_quarantined` no-op). Status exposes only `clear | consumed | quarantined`; no raw evidence, paths, or digests leak.

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
- `OpQualityReview` is emitted only by an explicit `/pdq` or `run-auto-pdq.mjs --manual` review; terminal events do not dispatch PDQ automatically.
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

Record a manual PDQ/backfill decision:

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
- `OpQualityReview`: expected after terminal pipeline events, but produced only by explicit manual review; valid historical/current skip/manual evidence reasons remain `auto-pdq-disabled`, `optional-hooks-disabled`, `terminal-event-backfill`, and `report-logic-regeneration-pending`. Resolution must use manual review/backfill or explicit evidence, never restoration of an automatic hook.
- `OpReview`: required after post-Phase-2B review-agent metric rows; valid skip/manual evidence reasons include `not-applicable`, `already-covered`, `docs-only`, `manual-review-done-outside-pidex`, `provider-quota-limited`, `operator-approved-risk`, and `duplicate-signal`.
- `OpGate`: required when a metric row contains a real gate; valid skip/manual evidence reasons include `not-applicable`, `already-covered`, `no-ui-change`, `manual-review-done-outside-pidex`, `operator-approved-risk`, and `expectation-wrong`.
- `OpRoute`: required when a metric row contains `route_to`; valid override/manual evidence reasons include `already-covered`, `duplicate-signal`, `operator-approved-risk`, `expectation-wrong`, and `manual-review-done-outside-pidex`.
- `OpSpawn`: required when an agent metric row exists; valid manual/backfill reasons include `already-covered`, `duplicate-signal`, `expectation-wrong`, and `provider-quota-limited`.
- `OpContextPack`: required when a post-Phase-2B agent metric row exists; valid manual/backfill reasons include `already-covered`, `duplicate-signal`, `expectation-wrong`, and `provider-quota-limited`.

When a matching `OpDecision` exists, PDQ reports a `valid_skip` finding, counts it as observed structured evidence, and excludes it from trace gap counts. Other operator expectations still use the legacy conservative classification until their contracts are added.

## Manual pending-only correction governance

`contract-correction-detector.mjs` can propose a bounded `allowed_skip_reasons` correction for `OpPreflight` or `OpQualityReview` after repeated explicit decisions. `contract-governor.mjs run` records those proposals only when invoked manually. It has no background hook, model delegate, approval, apply, evaluator, or normal agent-metric path.

Use `--dry-run` first. A non-dry run writes only pending correction-ledger rows and governance run artifacts. Approval and supersession remain explicit operator actions through `operator-contracts-admin.mjs`. Version-2 local overrides reject `required_when` and every patch field except bounded `allowed_skip_reasons` for the two supported operators.
