# PIDEX Provider Governance Module

Owns provider limit probing, profile selection helpers, and balance/profile governance logic.

## Module-owned implementation

- `modules/pidex/provider-governance/scripts/provider-limits/probe.mjs`
- `modules/pidex/provider-governance/scripts/profile/*.sh`

## Compatibility wrappers

- retired root wrapper; use `provider-governance.probe` through `scripts/modules/run-check.mjs`
- retired root wrapper; use `provider-governance.profile-current` through `scripts/modules/run-check.mjs`
- retired root wrapper; use `provider-governance.profile-recommend` through `scripts/modules/run-check.mjs`
- retired root wrapper; use `provider-governance.profile-use` through `scripts/modules/run-check.mjs`

## Stable config/public surface

- `config/balance.json`
- `config/balance.local.json`
- provider-related dashboard routes/API stay in dashboard host/core until dashboard contribution loader design exists.
