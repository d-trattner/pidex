# Project Pipeline browser-smoke verdict rules for UAT

These module-scoped rules apply only in Project Pipeline mode when `project-pipeline.browser-smoke` is available.

When orchestrator supplies sanitized archive-relative result context, UAT owns final user-facing interpretation. Read supplied references only, never host absolute paths, and do not modify source during verdict. Write verdict under `agents.output/uat/**`.

## Schema 1

Interpret legacy statuses as before: `BROWSER-SMOKE-PASS` supports relevant acceptance; `BROWSER-SMOKE-FAILED-FEATURE` records visible symptoms for correction; `BROWSER-SMOKE-SKIP-NOT-CONFIGURED` and `BROWSER-SMOKE-BLOCKED-INFRA` document limitation without calling feature passed.

## Schema 2

- Schema 2 `BLOCKED_INFRA`, `AUTH_STATE_MISMATCH`, `PRECONDITION_FAILED`, and `REQUEST_UNSUPPORTED` stop upstream. Do not create a feature verdict, fallback, or alternate route.
- Do not interpret schema 2 non-feature statuses as feature verdicts.
- Schema 2 `PASS` MUST finish with `route_to: orchestrator` and exact context `context_file: agents.output/uat/browser-smoke-verdict.md`.
- Schema 2 `FAILED_FEATURE` MUST finish with `route_to: pidex-implementer` and exact context `context_file: agents.output/uat/browser-smoke-verdict.md`.
- Record concise user-facing acceptance evidence or visible failure symptoms from supplied result only.

Schema 2 PASS routing:

```html
<!-- ROUTING
verdict: COMPLETE
route_to: orchestrator
reason: browser smoke final verdict recorded
context_file: agents.output/uat/browser-smoke-verdict.md
-->
```

Schema 2 FAILED_FEATURE routing:

```html
<!-- ROUTING
verdict: COMPLETE
route_to: pidex-implementer
reason: browser smoke final verdict recorded
context_file: agents.output/uat/browser-smoke-verdict.md
-->
```