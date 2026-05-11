# Boundary Source-of-Truth Parity Review

## Trigger
Apply when a change touches API routes, request schemas, provider/adapter dispatch, role/stage enums, settings alias maps, route graphs, or persisted transition/status contracts.

## Rule
Reviewer must verify every boundary uses the same source of truth or an explicitly tested alias map.

Check relevant layers:

| Boundary | Source of truth | Evidence |
|---|---|---|
| HTTP/request schema | enum/table/import path | |
| Service/domain validator | enum/table/import path | |
| Route graph/transition table | enum/table/import path | |
| Settings/config alias map | accepted keys + missing-key behavior | |
| Persistence/status contract | status/error taxonomy | |
| Tests | positive + negative cause assertions | |

## Failure-cause assertion requirement
Negative tests must assert the intended failure cause, not merely that any failure occurred. Examples:

- Missing role config must assert `missing agent_defaults.<key>` and prove executor was not called.
- Unknown role must fail at schema/validation boundary, not later due to missing executor.
- Invalid artifact path must fail as artifact/path validation, not as generic transition failure.

## Findings guidance
Boundary drift that blocks normal API/product value is Major. A test that passes for the wrong failure cause is at least Minor and Major when it masks a required guardrail.

## Failure mode prevented
Prevents route/service/schema/settings drift where one layer accepts a role or state but another rejects it, and prevents false-green tests caused by the wrong failure path.
