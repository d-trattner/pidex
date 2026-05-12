---
ID: 4
Origin: 4-dashboard-parity-mobile-projects
UUID: 5098e241
Status: Complete
---

# PI Rule Updates Applied

User approved recommended set: apply PI recommendations 1, 2, 3; defer PI-to-metrics bridge until orchestration-quality metrics epic.

## Applied

### 1. Planner UI-heavy/profile/designer preflight
- Added: `rules/pidex-planner/ui-heavy-profile-designer-preflight.md`
- Indexed: `rules/pidex-planner/index.md`
- Purpose: UI-heavy plans must use supported profile enum, keep designer active, and retain security separately for API/data surfaces.

### 2. Implementer dashboard route parity pre-review smoke
- Added: `rules/pidex-implementer/dashboard-route-parity-pre-review-smoke.md`
- Indexed: `rules/pidex-implementer/index.md`
- Purpose: dashboard parity/query work must prove route/API matrix before code review, including live filter, weekly/monthly tokens, and page-key reset.

### 3. QA status/evidence reconciliation
- Added: `rules/pidex-qa/status-evidence-reconciliation.md`
- Indexed: `rules/pidex-qa/index.md`
- Added devops guard: `rules/pidex-devops/qa-status-reconciliation-preflight.md`
- Indexed: `rules/pidex-devops/index.md`
- Purpose: QA blocked→complete transitions must patch same artifact; devops blocks contradictory QA status before readiness.

## Deferred
- PI-to-metrics bridge deferred to future epic: `agents.output/briefs/dashboard-orchestration-quality-metrics-epic.md`.

<!-- ROUTING -->
verdict: COMPLETE
route_to: orchestrator
context_file: agents.output/implementation/4-dashboard-parity-mobile-projects-pi-rule-updates.md
gate: none
reason: User-approved PI recommendations 1-3 applied as global PIDEX rules; metrics bridge deferred.
<!-- /ROUTING -->
