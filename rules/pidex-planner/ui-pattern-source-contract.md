# Rule: UI Pattern Source Contract

PROC-NEW-UI-PATTERN-SOURCE | pidex-planner

## Trigger

Load for any plan that creates or changes visible UI, including pages, forms, modals/sheets, navigation, empty states, cards, tables, status badges, or responsive layout.

## Rule

When plan says UI should "match", "reuse", "follow", "mirror", or "stay consistent with" existing UI, the plan MUST bind the source pattern. Vague pattern references are not enough.

## Required plan section

Add `## UI Quality Contract` or subsection under `Testing Strategy` with:

| Field | Required content |
|---|---|
| Pattern source | Existing file/path, route, component, or screenshot used as baseline |
| Reuse decision | `reuse` / `modify` / `new` for each relevant component |
| Parity checklist | Placement, labels/copy, states, validation, loading/error/empty/success, keyboard/focus, mobile behavior |
| Screenshot matrix | Required desktop/mobile states QA must capture |
| Browser flow | User-visible flow QA must execute in browser |

## Minimum parity checklist

For each UI component or flow affected:

- placement relative to surrounding page structure
- labels, button copy, helper text, error text
- disabled/loading/error/empty/success states
- validation behavior and persistence/reload expectation when data is involved
- keyboard/focus behavior for forms, dialogs, drawers, and menus
- mobile viewport behavior, including touch target and safe-area/overlay concerns when relevant

## Acceptance criteria binding

The plan's acceptance criteria or V-matrix must include at least one row verifying:

- pattern source parity against named source
- browser flow execution
- screenshot evidence for required states

## Invalid examples

- "Match the Network form pattern" with no source file/route/component.
- "Keep UI consistent" with no parity checklist.
- "QA should check screenshots" with no required states or artifact directory.

## Valid example

```
## UI Quality Contract

Pattern source: `apps/web/src/routes/network/-components/AddNetworkForm.tsx`, route `/network`
Reuse decision: modify existing form-shell pattern for Home Assistant add flow
Parity checklist: trigger placement, title/copy, labels, validation, cancel/save, loading/error/success, mobile 375x812
Screenshot matrix: desktop closed/open/error/success; mobile open/error
Browser flow: open route, trigger add form, submit invalid, submit valid, reload and verify new item remains visible
```

## Empirical basis

Plan 63 reached G9 with missing/wrong/low-quality UI controls because "match existing pattern" was not bound to source files, states, screenshots, and browser flow evidence during planning. This rule turns pattern parity into a verifiable contract before implementation.
