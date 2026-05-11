# Cross-Lane Synthesis Checkpoint

PROC-NEW: 029-PI-1

## Trigger
Structural contract plans with primary + secondary findings before G1 close.

## Rule
Before G1 close, planner MUST add `Cross-Lane Synthesis` table:
- finding source (primary/secondary)
- overlap/conflict status
- single merged decision
- plan section updated
- open items (or `none`)

## Gate
No route to implementer until table complete and all overlap rows resolved.

## Why
Stops late convergence loops. Keeps one contract truth.