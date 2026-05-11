# Rule: MSW Test-Local Handler Registration Self-Check

PROC-NEW-44a | pidex-implementer

## Rule

When implementing a slice that:
- Retires a global MSW handler (removes from handlers.ts), AND
- Adds component tests for a component that calls the same route

...before running tests, verify:
1. A test-local server.use(http.METHOD(pattern, handler)) is registered in beforeEach
2. server.resetHandlers() is called in afterEach
3. The mock response shape matches what the component expects

Do NOT assume the plan's AP reference guarantees the handler is present. Check the test file
before running the test suite.

## Diagnostic

If tests fail with "Request to [route] was not handled":
- Root cause: missing test-local MSW handler
- Fix: add server.use(http.METHOD(pattern, handler)) in beforeEach of the failing test file

## Empirical basis

Plan 44: BD-37 required a fourth implementer spawn for a 1-line server.use addition.
