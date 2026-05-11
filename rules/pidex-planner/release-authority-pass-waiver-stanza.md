# Release Authority + Pass/Waiver Stanza (PROC-NEW-4)

## Rule
For any high-risk release plan, include fixed non-optional stanza covering:
1. Release authority split (who can approve, who can execute mutation).
2. Hard blocker disposition path: pass or explicit waiver decision gate.

## Required stanza fields
- `release_authority:` <role/agent>
- `mutation_authority:` <role/agent>
- `blocker_disposition:` pass-required | waiver-required
- `waiver_gate:` <gate id + approver>

## Enforcement
If stanza missing, plan fails planning quality gate.
