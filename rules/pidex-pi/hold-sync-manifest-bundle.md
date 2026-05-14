# Rule: Hold-Mode Handoff Manifest Bundle

PROC-NEW-90-3 | pidex-pi

## Trigger

When PI routes forward from hold state or before closing a hold handoff artifact set.

## Rule

PI artifact package must include compact hold manifest to prevent scope leakage between plans.

Required bundle fields in handoff artifact before `pidex-roadmap` handoff:

- `commit_ids`: list of commit hashes tied to plan scope (or `[]` if no commits in scope).
- `commit_scope_manifest`: explicit include list of paths/files intended for the hold-synced bundle.
- `uncommitted_artifact_list`: list of non-committed workspace paths, owner, and include/exclude decision.

PI must route with `route_to: user` when any required field is missing or inconsistent.

## Rationale

Plan 90 showed dirty-tree carry and hold-state ambiguity. This rule makes handoff scope explicit before PI closes, rather than deferring interpretation to release-stage tooling.

## Relationship to existing rules

This complements `rules/pidex-devops/pre-hold-sync-gate.md`; it is a PI-level prerequisite for clean routing and documentation traceability.
