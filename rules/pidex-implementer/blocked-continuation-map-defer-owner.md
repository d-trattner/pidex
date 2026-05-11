# Blocked Continuation Map + Defer Owner Contract

PROC-NEW: 019-2

## Trigger
Implementer cannot continue due blocker (missing decision, missing artifact, external dependency, failed gate not resolvable in spawn).

## Requirement
When status becomes BLOCKED, implementation doc MUST include continuation map section:
- C1..Cn completed items
- Active blocked item (exact)
- Next owner (`defer_owner`) and required action
- Resume condition (objective check)
- Evidence path(s)

Also ROUTING reason must reference blocked item + owner handoff.

## Template
`BLOCKED-CONTINUATION: C1 <done>; C2 <done>; Active <item>; defer_owner <agent|user>; resume_when <condition>; evidence <path>`

## Fail Criteria
BLOCKED emitted without C1..Cn map or without explicit defer_owner.
