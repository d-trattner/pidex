# PIDEX Parallel Agents Module

Owns optional internal parallel-agent lane configuration/status helpers.

## Module-owned implementation

- `modules/pidex/parallel-agents/scripts/status.mjs`
- `modules/pidex/parallel-agents/scripts/run-lane.mjs`
- module-local TDD tests next to those scripts

## Compatibility wrappers

Stable legacy status entrypoint remains while active docs/skills callers migrate:

- `scripts/parallel-agents/status.mjs`

The internal run-lane wrapper has been retired; use the module-owned implementation.

## Config/public surface

Default/local config stays at the stable public paths until a module config-loader exists:

- `config/parallel-agents.json`
- `config/parallel-agents.local.json`

Dashboard API/routes remain dashboard host/core files until the separate dashboard contribution loader design is approved.
