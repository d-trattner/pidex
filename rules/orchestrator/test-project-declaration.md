# Rule: Test Project Declaration

PROC-NEW-TEST-PROJECT | orchestrator

## Trigger

Apply when the user asks to test, smoke-test, validate, experiment, create a fixture, or create a separate project for pipeline verification.

## Decision

Determine whether the activity uses the selected real project or creates a separate project identity:

- Tests, QA, browser smoke, or validation inside the selected real project: keep `is_test_project` absent/false.
- Separate fixture, disposable validation project, experiment, or smoke project: require `is_test_project: true` through the supported producer interface.
- Ambiguous whether a separate project will be created: ask one narrow clarification before creation.

The flag classifies project identity, not test activity. Never infer it from project name, path, `/tmp`, or words such as `test` and `smoke`.

## Ownership

The orchestrator declares intent and passes the boolean through Project Pipeline registry creation or pipeline-event emission. It must not edit registry JSON or dashboard SQLite directly.

For Project Pipeline creation, pass `--test-project true`. Reclassify an existing Project Pipeline registry entry only through `project-pipeline.lifecycle set-test-project --project-id ID --test-project true|false`; this command must not start or repair Docker resources. For event-only host-direct/hardened test projects, pass `--test-project true` on `pipeline_started`.

If the selected producer cannot persist the flag, stop and report the missing capability. Do not fall back to path/name heuristics.
