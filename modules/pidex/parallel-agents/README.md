# PIDEX Parallel Agents Module

Owns optional internal parallel-agent lane configuration/status helpers.

## Module-owned implementation

- `modules/pidex/parallel-agents/scripts/status.mjs`
- `modules/pidex/parallel-agents/scripts/run-lane.mjs`
- module-local TDD tests next to those scripts

## Compatibility wrappers

Stable legacy status entrypoint remains while active docs/skills callers migrate:

- retired root wrapper; use `parallel-agents.status` through `scripts/modules/run-check.mjs`

The internal run-lane wrapper has been retired; use the module-owned implementation.

## Config/public surface

Config precedence remains stable:

1. `PIDEX_PARALLEL_AGENTS_CONFIG` (operator-managed, read-only through dashboard saves)
2. `config/parallel-agents.local.json`
3. `config/parallel-agents.json` (disabled public default)

Dashboard API/routes remain dashboard host/core files until the separate dashboard contribution loader design is approved.
