# Automatic Quality Reports

PIDEX can run automatic PDQ quality reports after terminal pipeline lifecycle events.

## Trigger events

Automatic PDQ is enabled by default for these terminal events:

- `pipeline_completed`
- `pipeline_failed`
- `pipeline_aborted`
- `pipeline_cancelled`

## Disable

Disable automatic PDQ with:

```bash
PIDEX_AUTO_PDQ=0
```

## Outputs

Reports are written under:

```text
<pidex-root>/state/quality/
<pidex-root>/agents.output/quality/
```

PIDEX also emits an `OpQualityReview` operator event.

If the disabled-by-default contract governor is locally enabled, auto-PDQ can also spawn a fail-soft background governor run after the report. This is non-pipeline background governance and does not block terminal event recording. See [Quality governance](quality-governance.md).

## Notes

- `state/quality/` is runtime state.
- `agents.output/quality/` is generated operator-facing output.
- Generated `agents.output/quality/pdq-*.md` reports and `pidex/state/**` must not be committed. Preserve durable conclusions in `wiki/**` where appropriate.

## Contract-backed findings

PDQ findings include operator-contract metadata such as contract ID, expected condition, allowed skip/manual-evidence reasons, and resolution options. Explicit valid operator decisions count as observed evidence rather than generic trace gaps.

## Manual quality report

The PIDEX quality skill is available as:

```text
/pdq
```

It performs a read-only quality/self-improvement report and does not mutate rules or run a full `/pidex` pipeline.
