# Rule: UI Screenshot Matrix Contract

PROC-NEW-UI-SCREENSHOT-MATRIX | pidex-planner

## Trigger

Load for any UI plan that changes visible layout, form flows, modals/sheets/drawers, navigation, empty states, status displays, responsive behavior, or visual hierarchy.

## Rule

UI plans MUST declare a screenshot matrix that tells QA/designer exactly which states and viewports need visual evidence. "Take screenshots" is not enough.

## Required section

Add this section inside `UI Quality Contract`:

```markdown
### Screenshot Matrix
| Screenshot ID | Surface/route | Viewport | State | Required evidence | Owner |
|---|---|---|---|---|---|
```

## Minimum required states

Include every state that exists in scope:

- default/loaded
- empty
- loading
- error/validation error
- success/confirmation
- disabled/submitting
- modal/sheet/drawer open and closed
- mobile layout for interactive UI

## Viewport minimums

- Desktop: `1280×720` or plan-specific desktop target.
- Mobile: `375×812` for UI-heavy, forms, navigation, sheets/drawers, responsive changes.
- Tablet: required only when plan explicitly changes tablet layout or fixed/sticky shell geometry.

## Artifact directory

Plan must either:

- reference default `.playwright/` artifact directory, or
- declare a project-local ignored artifact directory.

Do not put image artifacts in `agents.output/`, `src/`, or repo root.

## Acceptance criteria binding

The V-matrix / acceptance criteria must include one row requiring screenshot artifacts for all Screenshot Matrix rows before QA/UAT/G9.

## Invalid examples

- "QA should capture screenshots."
- "Desktop and mobile screenshots as needed."
- Screenshot matrix with no state names or no viewport.

## Empirical basis

Plan 63 needed screenshots only after G9 rejection loops. A screenshot matrix makes visual evidence explicit before implementation and QA.
