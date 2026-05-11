# Rule: MSW Handler Scope Check

PROC-NEW-36b | pidex-critic

## Rule

When reviewing a plan that:
- Adds a new API route (server-side endpoint), AND
- Adds or modifies an MSW handler for that route

...verify the plan explicitly states whether the MSW handler will be registered globally
(in handlers.ts) or test-locally (in the component test file).

If the plan does NOT address handler scope: flag as BLOCKING.

## Finding format

Finding: MSW handler scope not specified for new route
Severity: BLOCKING
Route: [route path]
Details: Plan adds a new API route and an MSW handler but does not specify whether the handler
will be active during dev-mode browser sessions. Global handlers in handlers.ts intercept real
dev-server routes, making G9 preview verification impossible without moving the handler.
Fix: Add MSW-1 assumption to the plan. State: "handler lives in [global handlers.ts /
test-local <file>.test.tsx]". If global, document how G9 will be verified.

## Scope

Applies to any plan that adds both a new server-side route and an MSW handler for that route.
Does NOT apply to:
- Plans that only add MSW handlers without adding new routes
- Plans that only add routes without adding MSW handlers
- Projects not using MSW

## Empirical basis

Plan 36 (chat-llm-wiring): Plan AD-3 discussed MSW but focused on VITE_USE_MOCKS gating, not
handler placement. Neither the plan nor the critique flagged that new handlers in handlers.ts
would intercept dev-mode browser requests. G9-R1 rejected; fix consumed one investigation +
commit cycle.
