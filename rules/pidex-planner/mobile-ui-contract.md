# Rule: Mobile UI Contract

PROC-NEW-MOBILE-UI-CONTRACT | pidex-planner

## Trigger

Load for UI plans involving forms, navigation, modals/sheets/drawers, fixed/sticky chrome, responsive layout, tables/cards/lists, or any surface likely used on mobile.

## Rule

Mobile behavior must be specified as a contract, not a generic "responsive" claim.

## Required section

Add inside `UI Quality Contract`:

```markdown
### Mobile UI Contract
| Surface | Viewport | Layout behavior | Interaction/touch behavior | Keyboard/overlay/safe-area behavior | Evidence |
|---|---|---|---|---|---|
```

## Minimum checks

For each relevant mobile surface, specify:

- target viewport, default `375×812`
- where primary actions appear
- touch target expectation, minimum 44px for primary interactive controls
- keyboard behavior for forms
- safe-area/scroll behavior for bottom sheets, fixed bars, drawers, and modals
- overflow behavior for long content
- whether desktop-only affordances have mobile alternatives

## Acceptance criteria binding

Plan must include a browser/mobile evidence row requiring:

- mobile viewport checked
- relevant user flow executed on mobile
- screenshot saved
- overlay/fixed chrome does not block intended controls

## Invalid examples

- "Make it responsive."
- "Works on mobile."
- Mobile contract with no viewport.
- Form plan with no keyboard or submit/cancel behavior.

## Empirical basis

Mobile regressions and G9 loops often come from underspecified sheets, overlays, touch targets, and keyboard behavior. This rule turns mobile quality into a verifiable planning contract.
