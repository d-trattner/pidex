# Rule: New Endpoint → MSW Handler Completeness Audit

PROC-NEW-48-3 | pidex-implementer

## Rule

After each spawn, for every new API route introduced in that spawn:

1. Grep all test files that mount a component which calls that route (directly or via a hook).
2. Verify each such test file has an MSW handler for the route — either globally registered in
   `handlers.ts` or test-locally via `server.use(...)` in `beforeEach`.
3. A test file that mounts the component but does NOT exercise the code path through this route
   still needs a handler — MSW emits warnings or errors for unhandled requests even when the
   test does not assert on the response.

Document this check in the slice entry:

```
New endpoints this spawn: [list them]
For each endpoint:
  Consumer components: [list components]
  Test files mounting those components: [list files]
  Handler present in each file: [YES (global) / YES (test-local) / NO — fix before handoff]
```

## Diagnostic: detecting missing handlers before handoff

Run the test suite with `onUnhandledRequest: 'error'` in the MSW server setup (or examine
test output for "MSW: intercepted an unhandled" warnings). Any unhandled request for a new
route in a component test file = a gap to close before handoff.

## Scope

- Applies to any slice that adds a new server-side route (`POST /api/...`, `GET /api/...`, etc.)
- Does NOT apply to:
  - Routes that have no UI consumer component (pure server-side or CLI-only routes)
  - Route renames where the existing handler is simply updated

## Relationship to existing MSW rules

This rule is complementary to PROC-NEW-44a (MSW Test-Local Registration Self-Check), which
covers the case where a GLOBAL handler is RETIRED. This rule covers the case where a NEW route
is added — all affected test files need a handler, regardless of whether they exercise that path.

## Empirical basis

Plan 48 (network-auto-analysis-pipeline, 2026-04-28): The new `/api/v2/network/activity` route
was added in Spawn B. `network-page-agents.test.tsx` mounts a component that fires this route
but had no handler for it. AC-6 was a code-review BLOCKING finding. The missing handler did not
cause the test to fail (the code path was not exercised in that test), but it produced unhandled
request warnings that the code reviewer correctly flagged as a coverage gap. Fixed in `9998537`.

Same class of error as Plan 44. Cross-plan recurrence indicates a self-check is required.
