# Format/Footer Contradiction Scan

PROC-NEW: 029-PI-2

## Trigger
Any plan adding or changing output-format constraints, footer rules, or "last line" wording.

## Rule
Planner MUST run contradiction scan in plan acceptance checklist:
- output-format requirement
- mandatory footer requirement
- terminal-line requirement
- parser expectation

If any pair cannot be true together, planner revises wording before critic/implementer route.

## Minimum proof
Add one checklist row: `Format/Footer contradiction scan: PASS` with section refs.

## Why
Prevents impossible instruction sets and avoidable CR loops.