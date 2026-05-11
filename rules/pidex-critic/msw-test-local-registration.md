# Rule: MSW Test-Local Handler Registration Check

PROC-NEW-44a | pidex-critic

## Rule

When reviewing a plan that:
- Declares MSW-1 = test-local scope for a new route, AND
- Includes component tests for a component that calls that route

...verify the plan explicitly names:
1. The component test file that must register the handler
2. The server.use(http.METHOD(pattern, handler)) call
3. afterEach(() => server.resetHandlers()) teardown

If the plan only cites AP-36-5 generically without naming the file and sub-task: flag as BLOCKING.

## Finding format

Finding: MSW test-local handler registration sub-task missing
Severity: BLOCKING
Route: [route path]
Details: Plan declares test-local MSW scope but does not name the component test file or include
an explicit server.use(...) sub-task. Generic AP-36-5 citation is not sufficient — the implementer
will not know which file needs the handler.
Fix: Add MSW-reg sub-task to the slice that implements component tests. Name the file, route
pattern, and handler structure.

## Empirical basis

Plan 44: BD-37 — missing server.use in SubmenuPanel.test.tsx despite AP-36-5 citation in plan.
