# Enumeration Completeness Check

PROC-NEW: PIPELINE-ANALYST-1D

## Trigger

Plans that enumerate fixed domains, states, phases, steps, statuses, routes, sections, providers, roles, or other finite item sets and then define binding/validation behavior for that set.

## Rule

For each fixed enumeration, the plan must either:

1. include one binding row per enumerated item, or
2. include a binding row that explicitly says `applies to all <set>` and defines shared behavior.

Examples:

- domains: Network, HA, Automations → each covered by badge/status row or explicit applies-to-all row
- steps: Ticket, Interview, Architect, Planner → label-source contract covers each or shared derivation rule
- statuses: unavailable, degraded, ok → badge/aria/fallback row per status

## Reject when

- An enumerated item has no binding or shared applies-to-all rule.
- Validation mentions only a subset without explaining why.
- Prose leaves per-item behavior to implementer choice for user-visible/status-critical behavior.

## Why

Prevents planner/critic loops where a table exists but does not actually bind every item that the UI/API must handle.
