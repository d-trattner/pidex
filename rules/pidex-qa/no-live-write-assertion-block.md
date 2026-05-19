# No-Live-Write Assertion Block

PROC-104-D-3

## Trigger

Apply to QA of write-path work that could call external adapters/services, DB connectors, or filesystem mutators.

## Rule

Before QA COMPLETE and before UAT handoff, QA artifact must include a `No-Live-Write Assertion` block proving destructive safety:

1. **Mock/stub path proof** — tests/docs show mock or stub adapter is selected for failure/negative branches and for any destructive exercise.
2. **Zero live adapter writes** — evidence that real/live write targets are not called in these tests (call count, mock assert, or trace evidence).
3. **Fallback assertion** — when live adapter is unavailable, tests demonstrate fallback does not mask writes through hidden shared config.

## Required Evidence

- list of all write targets.
- execution transcript showing zero writes to live adapters.
- test/trace snippet proving mutation code path was isolated.

## NOT_CONFIGURED allowance

`NOT_CONFIGURED` is allowed only with:

- fixed reason (e.g., no safe staging adapter in environment),
- explicit fallback proof that mocked/stub path is intentionally selected, and
- explicit proof writes remain blocked while on fallback path.

Without this block, QA cannot mark `COMPLETE` for write-path slices.
