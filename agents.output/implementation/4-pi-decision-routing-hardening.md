---
ID: 4
Origin: governance-hardening
UUID: 5098e241
Status: Complete
---

# PI Decision Routing Hardening

## Problem
Pipeline auto-proceeded from `pidex-pi` to roadmap even though PI doc contained `User Decision Required` for rule/process updates.

## Changes Applied
- Added global PIDEX PI rule:
  - `rules/pidex-pi/user-decision-routing-consistency.md`
- Updated PI rule index:
  - `rules/pidex-pi/index.md`
- Hardened PI agent routing instructions:
  - `agents/pidex-pi.md`
- Added orchestrator enforcement rule:
  - `rules/orchestrator-pi-decision-scan.md`

## New Behavior
- PI must route to `user`/G7 when approval-needed rule/instruction/process changes remain unresolved.
- Orchestrator must scan PI `context_file` for decision markers before following ROUTING.
- If PI routes to roadmap while `User Decision Required` remains, orchestrator pauses and asks user instead.

<!-- ROUTING -->
verdict: COMPLETE
route_to: user
context_file: agents.output/implementation/4-pi-decision-routing-hardening.md
gate: G7
reason: PI routing/governance hardening applied directly per user request.
<!-- /ROUTING -->
