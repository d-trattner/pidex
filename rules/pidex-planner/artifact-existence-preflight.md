# Rule: Artifact Existence Preflight for Gate Context Contracts

PROC-NEW-026-1 | pidex-planner

## Rule

When plan binds validation gates to artifact paths (for example `context_file`, coverage context docs, smoke fixtures, or prior-stage outputs), planner must add explicit preflight checklist item:

- verify each referenced artifact path exists before gate run;
- if missing, create/update path binding in plan before execution;
- block gate start until all required artifacts exist.

## Required plan text pattern

Add checklist/table row under Testing Strategy or Execution Notes:

`Artifact existence preflight: PASS only when all referenced artifact paths resolve on disk.`

## Trigger

Apply when plan references any path-generated artifact consumed by later validation or release gates.

## Why

Prevents red-gate loops from stale/missing artifact references and avoids avoidable reruns.

## Empirical basis

Plan 026 v0.25.1 retro finding #3: coverage tests failed due stale/missing `context_file` artifact path reference.