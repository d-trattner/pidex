# Rule: MSW Handler Scope Audit for Plans Adding New API Routes

PROC-NEW-36a | pidex-planner

## Rule

When a plan introduces BOTH:
1. A new API route (new server route file, new endpoint)
2. A new MSW handler wired to that route (in handlers.ts or a test file)

...then the plan MUST include an explicit MSW Handler Scope decision in the File Surface table or
Assumptions table:

  MSW-1 — Handler Scope: New MSW handler for [route] lives in
  [global handlers.ts / test-local in <component>.test.tsx].
  Global = active in all browser dev-mode sessions.
  Test-local = active only in that test file.
  If global, document whether the handler will intercept real dev-server requests at G9 preview time.

## When to apply

Apply when ALL of the following are true:
- Plan adds a new server-side route (HTTP endpoint)
- Plan also adds or modifies MSW handler(s) for that route
- Project uses MSW for test mocking

## Why this matters

MSW handlers registered in handlers.ts are loaded by the MSW bootstrap and intercept ALL matching
requests — including browser requests in dev mode. When a plan wires a new component to a new real
server route in the same iteration, adding the MSW handler to handlers.ts silently intercepts
dev-mode browser traffic, making G9 impossible to pass without investigation.

The fix (move handler to test-local scope) is trivial. The detection cost at G9 is a full
rejection/fix/re-test cycle.

## Resolution pattern

Test-local scope (preferred for routes with real server implementations):
Use server.use(...) in beforeEach/afterEach in the component test file. The handler is scoped to
that test file and does not affect dev-mode browser sessions.

Global scope (for external APIs that will never have a real implementation in test context):
Add to handlers.ts. Document explicitly in the plan that this is intentional and that G9
verification will be done via the real server route.

## Empirical basis

Plan 36 (chat-llm-wiring, 2026-04-25): Chat handlers added to handlers.ts intercepted
GET /api/v2/chat/drawer and POST /api/v2/chat/send in dev-mode browser. G9-R1 rejected.
Fix: moved handlers to test-local scope in chat-drawer.test.tsx.
