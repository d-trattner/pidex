# Rule: MSW Test-Local Handler Registration Sub-Task

PROC-NEW-44a | pidex-planner

## Rule

When a plan chooses test-local MSW handler scope (per PROC-NEW-36a MSW-1 decision), the slice
that implements the component tests MUST include an explicit sub-task:

  MSW-reg — Test-local handler registration:
  File: `<component>.test.tsx`
  Route: `http.METHOD('pattern', handler)`
  Location: `beforeEach` block via `server.use(...)`
  Teardown: `afterEach(() => server.resetHandlers())`

The generic AP-36-5 reference is NOT sufficient. The plan must name:
1. The specific component test file
2. The HTTP method and route pattern
3. The handler structure (mock response shape)

## When to apply

When ALL of the following are true:
- Plan adds a new API route
- Plan's MSW-1 decision = test-local
- Plan adds component tests for the new UI that calls that route

## Why this matters

The "retire global handler, register local" connection is not self-evident to an implementer
reading an AP reference. BD-37 in Plan 44 was caused by this exact gap: the plan cited AP-36-5
(test-local scope) but the implementer wrote component tests without the local handler, causing
one failing test that required a fourth implementer spawn to fix.

## Empirical basis

Plan 44 (network-items-storage, 2026-04-27): BD-37 test failure — missing server.use(http.get(...))
for GET /api/v2/network/items in SubmenuPanel.test.tsx. Plan cited AP-36-5 without naming the
file or sub-task. Fourth implementer spawn required for a 1-line fix.
