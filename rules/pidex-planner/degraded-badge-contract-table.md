# Degraded Badge Contract Table

PROC-NEW: 74-1

## Rule
For plans touching degraded/unknown availability semantics, include one canonical contract table. Table must bind: source status value, badge glyph, badge copy, aria text, fallback behavior. Alternate wording or duplicate contracts forbidden.

## Enforcement
- Missing table: block before critic handoff.
- Multiple/contradicting tables: collapse to one canonical table before handoff.

## Why
Prevents ambiguity/rework loops across planner → implementer → reviewer.
