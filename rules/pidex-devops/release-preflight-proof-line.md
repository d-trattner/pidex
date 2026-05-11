# Release Preflight Proof Line

PROC-NEW-026-3

## Trigger

Apply during pidex-devops Stage 1 and Stage 2 for any release/tag/push decision.

## Rule

Deployment artifacts must include a compact `Release Preflight Proof Line` before G4 or completion.

Required fields:

```text
Release Preflight Proof Line: target=<version> commit=<sha> tag=<tag-or-none> tests=<PASS|FAIL|SKIPPED|NOT_CONFIGURED|BLOCKED> typecheck=<PASS|FAIL|SKIPPED|NOT_CONFIGURED|BLOCKED> coverage=<PASS|FAIL|SKIPPED|NOT_CONFIGURED|BLOCKED> smoke=<PASS|FAIL|SKIPPED|NOT_CONFIGURED|BLOCKED> gates=<summary> push=<not-run|main|tag|main+tag> dirty=<clean|triaged|dirty-blocked>
```

## Requirements

- Use only validation taxonomy tokens: `PASS`, `FAIL`, `SKIPPED`, `NOT_CONFIGURED`, `BLOCKED`.
- If any field is not applicable, use `SKIPPED` with a nearby reason.
- If tree is dirty, include dirty-tree triage reference and set `dirty=triaged` or `dirty=dirty-blocked`.
- For pushed releases, record both main and tag push evidence (remote + ref result).
- Include gate-loop count summary when any G1-G9 gate occurred during the run.

## Rejectable If Missing

For release/tag/push flows, missing proof line is a devops artifact defect. It does not invalidate already-passing tests, but must be fixed before final release summary/roadmap closure.
