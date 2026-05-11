# Rule: UI-Heavy Designer Required

PROC-NEW-UI-HEAVY-DESIGNER | pidex-designer

## Trigger

Treat plan as `ui-heavy` when it includes any of:

- new page, tab, sub-tab, modal, sheet, wizard, or form
- navigation or information architecture change
- mobile/responsive layout change beyond text/icon swap
- visual pattern parity requirement against existing UI
- new empty/error/loading/success states visible to users
- G9-required UI work after prior G9 rejection or user visual complaint

## Rule

For `ui-heavy` plans, pidex-designer review is mandatory before implementation. The design review MUST produce concrete pre-implementation specs and, when screenshots are required by plan, request post-implementation screenshot audit before QA/UAT.

## Required design review content

For `ui-heavy` plans, include:

- UI scope summary by screen/flow
- pattern source assessment against named source from plan
- component specs for placement, hierarchy, copy tone, spacing, states
- mobile behavior and touch target notes
- accessibility checklist: labels, focus order, keyboard path, contrast/touch targets
- screenshot audit request: required states and viewports for post-implementation review
- Must-Fix Before Commit section for all Medium+ issues

## Routing expectation

- Pre-implementation verdict `APPROVED` / `APPROVED_WITH_COMMENTS` routes to `pidex-implementer`.
- If screenshot audit is required, design review must say: `Post-implementation designer audit required before QA/UAT`.
- Post-implementation audit routes to `pidex-qa` only after Must-Fix items are satisfied or explicitly deferred by user.

## Non-heavy UI

Small copy/icon/text-only UI changes may receive short design review or N/A approval. Do not require screenshot audit unless plan or risk warrants it.

## Empirical basis

Plan 63 had multiple G9 loops due to missing flow, wrong placement, and poor form quality. UI-heavy work needs designer involvement before implementation and screenshot audit before QA/UAT so visual problems are caught before user preview.
