# UI Intent + Proof Contract Check

When reviewing UI plans, critic MUST reject plans that leave placement, visual proof, table layout, or copy semantics ambiguous.

## Reject when triggered but missing

- UI placement/layout request without `UI Intent Contract` or equivalent concrete decisions.
- Pattern/parity claim without source component/route and exact parity dimensions.
- G9-corrective UI plan without screenshot/selector/container proof requirements.
- Table/list work without `Table UI Checklist`.
- UI copy mentioning agent/AI/LLM/audit/analysis without `Copy Semantics Contract`.
- Mobile-relevant UI without viewport and mobile evidence requirements.

## Routing

- If the ambiguity is user intent, route to `user`/`orchestrator` for UI design interview.
- If the plan can be fixed by planner from existing code, route to `pidex-planner`.
- If the UI is heavy/new pattern and needs design judgement, route to `pidex-designer`.
