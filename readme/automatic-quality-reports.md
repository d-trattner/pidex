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

## Notes

- `state/quality/` is runtime state.
- `agents.output/quality/` is generated operator-facing output.
- Generated `agents.output/quality/pdq-*.md` reports should generally not be committed unless intentionally preserved as project evidence.

## Manual quality report

The PIDEX quality skill is available as:

```text
/pdq
```

It performs a read-only quality/self-improvement report and does not mutate rules or run a full `/pidex` pipeline.
