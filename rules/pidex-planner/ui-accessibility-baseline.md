# Rule: UI Accessibility Baseline

PROC-NEW-UI-A11Y-BASELINE | pidex-planner

## Trigger

Load for any UI plan with interactive controls, forms, navigation, dialogs/modals/sheets/drawers, status messages, tables/lists, or user-visible error/success states.

## Rule

Plans must specify baseline accessibility expectations so designer, implementer, QA, and UAT can verify them.

## Required section

Add inside `UI Quality Contract`:

```markdown
### Accessibility Baseline
| Surface/control | Label/name | Keyboard/focus expectation | Status/error announcement | Contrast/touch target expectation | Evidence |
|---|---|---|---|---|---|
```

## Minimum baseline

Specify when applicable:

- accessible name/label for every new interactive control
- keyboard path for forms, menus, tabs, dialogs, sheets, drawers
- visible focus behavior
- error/success message association with related control or form
- overlay focus containment/return behavior
- WCAG AA contrast expectation for text and controls
- 44px touch target expectation for primary mobile controls

## Acceptance criteria binding

Plan must include at least one accessibility evidence row for interactive UI. QA evidence may be manual/browser-based unless the project already has automated a11y tooling.

## Invalid examples

- "Ensure accessibility."
- "Use semantic HTML" with no focus/label/error requirements.
- Dialog/sheet with no focus return or keyboard behavior.

## Empirical basis

Accessibility defects are expensive to discover at G9 or after release. A small baseline table makes them visible before implementation.
