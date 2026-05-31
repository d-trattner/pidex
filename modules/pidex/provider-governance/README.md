# PIDEX Provider Governance Module

Owns provider limit probing, profile selection helpers, and balance/profile governance logic.

## Module-owned implementation

- `modules/pidex/provider-governance/scripts/provider-limits/probe.mjs`
- `modules/pidex/provider-governance/scripts/profile/*.sh`

## Compatibility wrappers

- `scripts/provider-limits/probe.mjs`
- `scripts/profile/current.sh`
- `scripts/profile/recommend.sh`
- `scripts/profile/use.sh`

## Stable config/public surface

- `config/balance.json`
- `config/balance.local.json`
- provider-related dashboard routes/API stay in dashboard host/core until dashboard contribution loader design exists.
