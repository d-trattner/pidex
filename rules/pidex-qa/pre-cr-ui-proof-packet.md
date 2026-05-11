# Pre-Code-Review UI Proof Packet for Corrective UI Plans

PROC-NEW-69-1 | pidex-qa / orchestrator

## Trigger

This rule applies when all are true:

1. The plan is UI-heavy or G9-applicable.
2. The work is corrective after a user/G9 visual or interaction rejection, or explicitly says parity/match/same-as.
3. The implementation changes interactive UI controls, layout geometry, enabled/disabled states, validation, or form submission.

## Requirement

Before the pipeline treats code review / QA / UAT evidence as sufficient for G9, collect a browser-level proof packet that exercises the exact rejected user behavior. Screenshots alone are insufficient.

The proof packet MUST include:

| Proof area | Required evidence |
|---|---|
| Selectors/containers | DOM selector for the target container/control and source-reference container when parity is claimed |
| Geometry/placement | Bounding boxes or equivalent proof for placement claims (e.g. left column vs full width) |
| Clickability | Playwright click succeeds on the target controls; no overlay/pointer/disabled blocker |
| Enabled/disabled transitions | Evidence before and after opening forms/actions, including disabled=false when the user expects to click |
| Validation behavior | Empty submit validation/focus behavior and filled submit path when forms are changed |
| Runtime state | Live data visible OR explicit degraded reason when live state is part of the value claim |
| Artifact paths | Screenshot/video/trace/JSON summary paths under project `.playwright/` or plan-declared ignored artifact dir |

## QA verdict rule

For triggered plans, QA MUST NOT emit `COMPLETE` unless one of these is true:

- Proof packet is present and linked in the QA artifact.
- QA routes `BLOCKED` to `orchestrator` with reason containing `browser smoke BLOCKED` and a precise list of missing proof items.

## Reporting template

```markdown
## Pre-CR UI Proof Packet
- Trigger: corrective UI / G9 / parity
- Artifact dir: `.playwright/<plan-or-slug>/`
- Controls exercised:
  - [ ] <control> click succeeds
  - [ ] enabled/disabled transition captured
  - [ ] validation/focus captured
- Layout proof:
  - [ ] <selector> bbox = ...
  - [ ] reference <selector> bbox = ...
- Runtime proof:
  - [ ] live data visible OR degraded reason visible
- Result: PASS | BLOCKED | FAIL
```

## Notes

Scope this rule to corrective UI/parity plans to avoid overburdening ordinary UI changes.
