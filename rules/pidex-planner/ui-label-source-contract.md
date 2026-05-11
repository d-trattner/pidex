# UI Label Source Contract

PROC-NEW: PIPELINE-ANALYST-1A

## Trigger

Plans changing repeated, hierarchical, status, lifecycle, table/list, card-row, badge, tab, stepper, or grouped UI where visible labels are derived from data fields/constants.

Examples:

- lifecycle step cards
- status badges
- table/list row titles
- grouped phase/status labels
- repeated cards where title/copy comes from a payload field

## Rule

Include a `UI Label Source Contract` table in the plan.

```md
## UI Label Source Contract
| Surface / element | Visible label | Source-of-truth field/constant | Fallback | Evidence |
|---|---|---|---|---|
| Step mini-card title | semantic step name | PHASE_STEPS.label, not entry.title | unknown step | screenshot + test |
```

## Enforcement

- Missing table on triggered UI work: block before critic handoff.
- Vague source like "API data" is insufficient when multiple fields/constants can supply the label.
- If the label is intentionally changed from existing UI, state that explicitly in `May Change` / parity contract.

## Why

Prevents semantic visible-text drift where screenshots/selectors exist but the wrong field drives user-facing labels.
