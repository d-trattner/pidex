# Manual Quality Reports

PIDEX does not dispatch PDQ automatically from terminal pipeline lifecycle events. Terminal recording remains bounded to lifecycle and wiki-hygiene duties; quality review is an explicit operator action.

## Run manually

Use the read-only quality skill:

```text
/pdq
```

Or invoke the retained compatibility runner with explicit confirmation:

```bash
node scripts/quality/run-auto-pdq.mjs --manual \
  --project <project-root> \
  --plan <plan-key> \
  --pipeline-id <pipeline-id> \
  --terminal-event manual
```

Without exact `--manual`, the runner exits with `MANUAL_CONFIRMATION_REQUIRED` and writes nothing. `PIDEX_AUTO_PDQ` is no longer an activation control, and terminal event handling contains no automatic PDQ hook.

## Outputs

Reports are written under:

```text
<state-root>/quality/
<pidex-root>/agents.output/quality/
```

`<state-root>` follows `PIDEX_STATE_DIR`, then the inherited `RUNNING_PI_STATE_DIR` legacy alias, then `<pidex-root>/state`.

A successful explicit run emits an `OpQualityReview` operator event labelled `manual-pdq`. It does not start the contract governor. Contract-correction detection is a separate manual, pending-only operation against an existing report; it cannot approve, apply, delegate, or validate corrections. See [Quality governance](quality-governance.md).

## Notes

- Quality state and `agents.output/quality/` are generated runtime evidence.
- Generated reports and `pidex/state/**` must not be committed. Preserve durable conclusions in `wiki/**` where appropriate.
- A terminal pipeline without a manual quality review may remain a truthful low-severity trace gap or receive an explicit supported skip/manual-evidence decision; PIDEX does not fabricate review evidence.

## Contract-backed findings

PDQ findings include operator-contract metadata such as contract ID, expected condition, allowed skip/manual-evidence reasons, and resolution options. Explicit valid operator decisions count as observed evidence rather than generic trace gaps.

Run-specific evidence (`OpSpawn`, `OpContextPack`, `OpReview`, `OpRoute`, `OpGate`) must match project, plan, role, observed mode and execution identity. Host-direct and hardened host telemetry share the existing `run_dir` across metrics and events; Project Pipeline metrics use `project_run_id`. PDQ does not invent missing Project Pipeline operator events. Plan-wide Preflight/QualityReview contracts retain their own granularity.

A run-scoped manual decision must carry the same identity/scope and exact `target_step`. The operator-decision CLI supports additive fields through `--extra-json` (for example `agent`, `project_mode`, and the existing `run_dir` copied from the metric). These are observational references, not review lifecycle authority. Broad legacy decisions cannot satisfy multiple independent runs.

Legacy missing identities, mismatched targets and conflicting same-identity records remain trace gaps; identical duplicate records count once. This can increase reported gaps without any new runtime failure. Historical data is not rewritten, and a zero-gap report is still not a causal quality or product-acceptance proof.

The direct `scripts/quality/report.mjs` CLI uses the same state-root resolver for input, saved mode and default JSON output. Explicit `--json-out` and `--md-out` paths retain precedence.
