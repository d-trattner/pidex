# Rule: Browser Stall Fallback Protocol

PROC-NEW-25 | pidex-qa

## Rule

**When Playwright budget exhausts before mandatory UI browser smoke completes: emit ROUTING with `verdict: BLOCKED`, not `COMPLETE` or `FAILED`.**

`verdict: FAILED` signals pidex-implementer to enter a fix loop. A browser budget stall is not an implementation failure — it is a QA infrastructure constraint. `verdict: COMPLETE` would incorrectly allow pidex-uat/G9 without browser evidence. The orchestrator must collect browser evidence, append it to the QA doc, then resume/reroute QA or UAT.

## Trigger conditions

Invoke this fallback when ANY of the following are true:
- Agent is at > 85% of `maxTurns` and browser smoke has not started
- Three or more Playwright tool calls have failed with connection/timeout errors
- Browser smoke is blocked on a dev server that will not start within the tool budget

## Protocol

1. Write the partial QA doc with Phase 1 results complete. In the Browser-Level Smoke section, write:
   ```
   ## Browser-Level Smoke

   Status: BLOCKED — orchestrator Playwright MCP required

   Phase 1 (unit/integration tests): complete — see results above.
   Browser smoke testing could not be completed within agent tool budget.
   The orchestrator must run browser smoke via Playwright MCP and append results here.
   QA is not complete until browser evidence is present.
   ```

2. Emit ROUTING:
   ```html
   <!-- ROUTING
   verdict: BLOCKED
   route_to: orchestrator
   reason: Phase 1 unit/integration complete — browser smoke BLOCKED, orchestrator must collect Playwright evidence before UAT
   context_file: agents.output/qa/<id>-<slug>-qa.md
   -->
   ```

## Why `BLOCKED` not `FAILED` or `COMPLETE`

- `FAILED` → orchestrator routes to pidex-implementer → unnecessary fix loop
- `COMPLETE` → orchestrator may route to pidex-uat/G9 without required browser evidence
- `BLOCKED` → orchestrator must collect missing browser evidence, append results, then reroute

## What the orchestrator does on receipt

On `verdict: BLOCKED` with `route_to: orchestrator` or `reason` containing "browser smoke BLOCKED":
1. Read the partial QA doc.
2. Use Playwright MCP to run browser smoke tests.
3. Append results to the QA doc's Browser-Level Smoke section.
4. If browser smoke passes, route to pidex-uat with the updated QA doc.
5. If browser smoke fails, route to pidex-implementer with the failing browser evidence.

## What is NOT a browser stall fallback trigger

- Phase 1 test failures → `verdict: FAILED` (correct, real failures)
- A single Playwright connection retry → retry up to 3 times before invoking fallback
- Browser smoke not yet attempted when budget is < 85% → continue attempting

## Empirical basis

Plans 29, 30, 31, 32, 34: pidex-qa stalled on browser testing in all five plans. Orchestrator handled via Playwright MCP each time — but improvised (no documented protocol). This rule documents the protocol so pidex-qa emits a clean ROUTING signal rather than stalling silently or emitting ambiguous output.
