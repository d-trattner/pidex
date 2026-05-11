# Rule: Route Security Contract Table

PROC-NEW-61-1 | pidex-planner

## Trigger
Apply when plan adds or changes an API route.

## Rule
Plan MUST include compact "Route Security Contract" table per new/changed route.

## Required columns
- Status code
- Outward error string (sanitized)
- Non-leak proof (explicit statement raw upstream/provider errors never returned)

## Constraints
- Keep table short (3-5 rows typical)
- Include table in plan body before handoff to implementation/review

## Why
Forces explicit security contract early. Prevents late-loop fixes for error leakage.
