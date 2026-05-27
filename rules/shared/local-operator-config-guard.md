# Local Operator Config Guard

PROC-LOCAL-CONFIG-1

## Rule

Mutable operator/runtime configuration must not be overwritten by public-default cleanup, release hardening, branch sync, or portability work.

Tracked defaults may be safe/public examples. Live operator values must live in ignored local override files or state files and must be read preferentially at runtime.

## Protected live config examples

- `config/balance.local.json` — dashboard agent-balance snapshots and provider labels.
- `config/parallel-agents.local.json` — enabled optional parallel-agent lanes for this operator.
- `state/**` runtime observations, warnings, metrics, events, and generated status.
- `dashboard/data/**` local SQLite/read-model data.

Tracked public defaults remain safe to publish:

- `config/balance.json`
- `config/parallel-agents.json`

## Required pattern

When a feature has both public defaults and operator-specific values:

1. Keep tracked defaults secret-free and conservative.
2. Store live values in an ignored `*.local.json` or `state/**` file.
3. Runtime reads local override first, then tracked default.
4. Runtime/dashboard writes go to the local override, not to the tracked public default.
5. Public-readiness checks must validate tracked defaults without requiring destructive edits to local operator state.
6. Any migration or cleanup touching these paths must state whether it preserves, moves, or intentionally resets local operator values.

## Review checks

Reject changes that:

- replace local operator config with empty public defaults without explicit user approval;
- require toggling live local settings off to pass release/public checks;
- write dashboard/operator mutations back into tracked public default files;
- omit a local-override fallback when introducing new mutable config.
