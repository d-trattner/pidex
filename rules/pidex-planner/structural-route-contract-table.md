# Structural Route-Contract Table (Pre-Critic)

PROC-NEW: 019-1

## Trigger
Plan classified structural/cross-cutting route-graph or agent-route workflow change.

## Requirement
Before critic handoff, planner MUST include mandatory route-contract table covering full intended edges:
- from_agent
- to_agent
- trigger/condition
- skip_condition
- artifact contract (`ROUTING` + `context_file`)
- terminal outcome (`COMPLETE|DEFERRED|REJECTED|BLOCKED`)

## Pass Criteria
- Table present in plan doc.
- Every role-edge in scope represented.
- Skip paths explicit (not implied prose).
- Terminal states explicit.

## Fail Criteria
Missing table, partial edge list, or absent skip/terminal columns = plan not critic-ready.
