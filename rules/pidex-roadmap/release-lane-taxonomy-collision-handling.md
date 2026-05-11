# Rule: Release-Lane Taxonomy Collision Handling

PROC-NEW-026-3B | pidex-roadmap

## Rule

When updating roadmap for plans with possible stream/name collision, roadmap entries must carry explicit lane tag aligned with planner taxonomy.

Canonical lane values:
- `hotfix-lane`
- `epic-lane`

## Required roadmap behavior

- include lane tag in relevant roadmap row/section;
- do not merge/update rows across different lane tags even if plan ID/version text appears similar;
- if collision detected, create/update distinct rows and cross-link for clarity.

## Trigger

Apply on every post-devops close and every post-retro roadmap handoff where overlapping IDs/streams exist.

## Why

Maintains deterministic mapping plan -> roadmap lane and prevents release-tracker ambiguity.

## Empirical basis

Plan 026 v0.25.1 retro finding #2: overlap between hotfix and epic streams.