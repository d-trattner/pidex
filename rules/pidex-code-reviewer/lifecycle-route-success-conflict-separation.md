# Rule: Lifecycle Route Test Success/Conflict Separation

PROC-NEW-90-2 | pidex-code-reviewer

## Trigger

Apply when reviewing tests for lifecycle/mutation routes where conflict responses are expected (e.g., duplicate submit, background job already running, invalid transition).

## Rule

Tests must separate success and conflict outcomes into distinct assertions and distinct test cases.

Reject patterns:

- `expect(status).toContain([200,409])` or equivalent status sets.
- single test that treats conflict state as acceptable success.
- mixed assertions where both `200` and `409` are accepted in one case.

Required evidence:

- one test for success contract (`200` + intended payload / side effect);
- one test for each conflict/409 contract (explicit error code/shape + non-mutating effect check);
- failure tests assert intended failure cause, not generic error path.

## Enforcement

If a lifecycle route test conflates success and conflict, record **Major** finding and set verdict to `REJECTED` unless the file is a small test-only hotfix and `tdd-table-narrow-hotfix-escape.md` explicitly permits partial exception.

## Why

Conflating acceptance of `200` and `409` masked route contract errors in Plan 90 and forced extra review/test cycles.
