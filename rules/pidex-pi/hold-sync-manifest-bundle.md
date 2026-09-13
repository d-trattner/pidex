# Rule: Hold-Mode Handoff Manifest Bundle

PROC-NEW-90-3 | pidex-pi

## Trigger

Only for explicitly assigned release-HOLD/local-sync maintenance under the referenced DevOps rule, not a runtime review/closeout hold. Do not infer this task from DEFERRED analysis or a failed producer return. In artifact_only mode, do not collect unrelated workspace artifacts or perform sync/cleanup.

## Rule

PI artifact package must include compact hold manifest to prevent scope leakage between plans.

Required bundle fields for that authorized maintenance handoff (producer-bound returns to orchestrator; explicit unbound routing follows the PI mode/decision matrix):

- `commit_ids`: list of commit hashes tied to plan scope (or `[]` if no commits in scope).
- `commit_scope_manifest`: explicit include list of paths/files intended for the hold-synced bundle.
- `uncommitted_artifact_list`: list of non-committed workspace paths, owner, and include/exclude decision.

PI must return BLOCKED with `route_to: user` when an applicable required field is missing or inconsistent. A complete manifest never clears a runtime hold, authorizes another model call, widens write scope or waives producer obligations.

## Rationale

Plan 90 showed dirty-tree carry and hold-state ambiguity. This rule makes handoff scope explicit before PI closes, rather than deferring interpretation to release-stage tooling.

## Relationship to existing rules

This complements `rules/pidex-devops/pre-hold-sync-gate.md`; it is a PI-level prerequisite for clean routing and documentation traceability.
