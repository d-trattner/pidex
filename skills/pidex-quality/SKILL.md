---
name: pidex-quality
description: Read-only PIDEX quality/self-improvement report. Invoke with /pdq. Inspects metrics, pipeline events, artifacts, rules, and orchestrator events; emits JSON + markdown reports. Does not mutate rules or run a full /pd pipeline.
---

# PIDEX Quality (`/pdq`)

Use this skill when the user invokes `/pdq` or asks for a PIDEX quality/self-improvement report.

## Purpose

Generate a read-only quality report for PIDEX using existing evidence:

- `state/metrics/**.jsonl`
- `state/pipeline-events/**.jsonl`
- `state/orchestrator-events/**.jsonl`
- `agents.output/**`
- `rules/**`

The report focuses on facts, dimensions, confidence labels, and evidence links. It must not present one aggregate quality score as truth.

## Command

From `<pidex-root>`:

```bash
python3 scripts/quality/report.py --project <pidex-root> --last 10
```

Useful options:

```bash
python3 scripts/quality/report.py --project <pidex-root> --since-last-review
python3 scripts/quality/report.py --project <pidex-root> --plan plan-004
python3 scripts/quality/report.py --project <pidex-root> --json-out state/quality/manual.json --md-out agents.output/quality/manual.md
```

## Guardrails

- Read-only except writing report files under `state/quality/` and `agents.output/quality/`.
- Do not edit rules automatically.
- Treat historical Running Pi data as external/baseline only if explicitly requested.
- Use `insufficient-data` when evidence or sample size is weak.
- Missing event logs are instrumentation/orchestrator gaps, not subagent failures by default.

## Output

Return concise summary with report paths and top findings.
