# PIDEX Parallel Agents Module

Owns optional internal parallel-agent lane configuration/status helpers.

## Module-owned implementation

- `modules/pidex/parallel-agents/scripts/status.mjs`
- `modules/pidex/parallel-agents/scripts/run-lane.mjs`
- module-local TDD tests next to those scripts

## Compatibility wrappers

Stable legacy entrypoints remain as thin wrappers:

- `scripts/parallel-agents/status.mjs`
- `scripts/parallel-agents/run-lane.mjs`

## Config/public surface

Default/local config stays at the stable public paths until a module config-loader exists:

- `config/parallel-agents.json`
- `config/parallel-agents.local.json`

Dashboard API/routes remain dashboard host/core files until the separate dashboard contribution loader design is approved.
