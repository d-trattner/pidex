# Rule: G9 Gate Message Must Include Explicit Dev Server Port

PROC-NEW-44c | pidex-uat

## Rule

The UAT doc's "Preview Instructions" section must state the exact dev server URL with port:

  Preview: http://<host>:<port>

For projects with multiple concurrent dev servers (e.g., one for the app, one for API dev):
also identify which server this is.

The orchestrator reads this section to construct the G9 terminal gate context. The
port must be propagated verbatim into the G9 context message.

## G9 gate context must include

```text
Localhost URL: http://127.0.0.1:<PORT>/<route>
LAN URL: http://<lan-host>:<PORT>/<route>
Verified: listening on 0.0.0.0:<PORT>; LAN route returned 200
<test summary line>
Check: <what to verify>
```

For headless/server runs, localhost-only preview instructions are insufficient. If the doc chain only has `127.0.0.1` or `localhost`, UAT must request LAN URL verification before routing G9.

## Why this matters

Projects with multiple dev servers (e.g., port 3002 for app, port 3008 for another service)
create ambiguity. Without an explicit port and LAN URL in the gate message, the user relies on memory to
find the correct server or tries an unreachable localhost URL — triggering a false G9 rejection
that consumes an investigation cycle.

## Empirical basis

Plan 44 (network-items-storage, 2026-04-27): G9 first attempt navigated to port 3008 instead
of port 3002. No code issue; user redirected manually. Cost: one false G9 attempt + context
reconstruction.
