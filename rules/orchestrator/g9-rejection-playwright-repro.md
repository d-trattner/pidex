# Rule: G9 Rejection Requires Live Playwright Reproduction

PROC-NEW-G9-REPRO | orchestrator

## Trigger

Load immediately after any user rejects a G9 preview for UI/navigation/browser-runtime behavior. Mandatory after the second G9 rejection in the same plan or when the user reports an exact route, selector, click target, screenshot, visible wrong page, console error, or network/API failure.

## Rule

Do not ask the user to preview the same G9 flow again until PIDEX has live-browser Playwright evidence that the rejected flow now passes.

Unit/component tests, mocked resolver tests, curl checks, and static code review are insufficient for a rejected browser flow. The evidence must exercise the real dev/preview server in a browser.

## Orchestrator duties on rejection

1. Capture a `G9 Rejection Repro Contract` in the next handoff:
   - user report, exact words if useful
   - preview URL / route
   - exact selector/data-testid/text clicked when known
   - expected URL/visible result
   - actual URL/visible result
   - console/network clues from user or prior run
2. If this is the second rejection for the plan, or if the failure is navigation/runtime/API-auth related, run a quick Playwright repro yourself before another broad agent loop when tooling is available.
3. Route fix to `pidex-implementer` with the repro contract and require regression-first evidence.
4. Route to `pidex-qa` with the same repro contract.
5. Before presenting G9 again, verify QA/orchestrator evidence includes the exact rejected browser flow passing on the live dev/preview server.

## Required Playwright evidence before next G9

Evidence must include:

- dev/preview server command and base URL
- route opened
- exact locator used (`data-testid`, role/name, or text)
- click/action sequence matching user report
- final `page.url()` assertion or visible-state assertion
- console errors collected
- network failures/401/403/5xx collected for the flow
- screenshot path when visual state matters

For navigation bugs, assert the canonical destination URL, not only that a click handler was called. For API-backed UI, do not mock the browser request unless the app normally uses that mock in preview; capture real browser network result.

## Gate

If required evidence is missing or failed, do not ask G9 again. Route to `pidex-qa` as `BLOCKED` for browser evidence or to `pidex-implementer` with the failing Playwright evidence.

## Empirical basis

A G9 navigation issue passed navigateMock/resolver tests and focused Vitest/API checks, but the live browser fetch returned 401 and the UI silently fell back to `/pipeline/:entryId`. Only Playwright against the live preview exposed it. G9 must not be the first real-browser validation for previously rejected flows.
