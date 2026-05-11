# Rule: Release-Lane Taxonomy Collision Handling

PROC-NEW-026-3A | pidex-planner

## Rule

When plan ID or naming overlaps another active stream (example hotfix finalization vs separate epic track), planner must bind explicit release-lane taxonomy in plan metadata and roadmap reference.

Canonical lane values:
- `hotfix-lane`
- `epic-lane`

## Required plan fields

- `release_lane`: one canonical value above
- `lane_scope_note`: one-line stream definition
- `roadmap_row_ref`: target roadmap row/section for same lane

## Collision check

Before critic handoff:
- verify no active plan in same ID window uses conflicting lane for same deliverable;
- if collision found, rename plan slug/title or split lane label before execution.

## Why

Prevents scope drift and document ambiguity when parallel streams share IDs or similar names.

## Empirical basis

Plan 026 v0.25.1 retro finding #2: naming overlap between hotfix finalization and architect epic stream caused lane confusion.