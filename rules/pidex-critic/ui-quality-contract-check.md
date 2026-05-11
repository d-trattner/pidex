# Rule: UI Quality Contract Check

PROC-NEW-UI-QUALITY-CONTRACT | pidex-critic

## Trigger

Load when reviewing any plan that creates or changes visible UI, including forms, pages, navigation, modals/sheets, cards, tables, status badges, empty states, or responsive layout.

## Rule

pidex-critic MUST reject or comment on UI plans that lack a verifiable UI Quality Contract.

## Required checks

For UI plans, verify plan includes:

1. **Gate G9 declaration** — required or not applicable, with reason.
2. **Browser-level smoke AC** — Playwright/browser evidence, not curl-only.
3. **Pattern source contract** when existing UI parity is claimed:
   - named source file/path/route/component
   - reuse decision: `reuse` / `modify` / `new`
   - parity checklist for placement, copy, states, validation, keyboard/focus, mobile
4. **Screenshot matrix** — required states and desktop/mobile viewports.
5. **User browser flow** — concrete user-visible flow QA must execute.
6. **Screenshot matrix contract** — exact states, viewports, artifact directory, and evidence owner.
7. **Mobile UI contract** for mobile-relevant surfaces — viewport, touch target, keyboard/overlay/safe-area behavior.
8. **Accessibility baseline** for interactive UI — labels, keyboard/focus, status/error announcements, contrast/touch targets where relevant.

## Severity

| Missing item | Severity |
|---|---|
| No browser-level smoke AC for UI plan | CRITICAL |
| No G9 declaration | MEDIUM |
| Existing pattern parity claimed but no source named | MEDIUM |
| No screenshot matrix for UI-heavy work | MEDIUM |
| Screenshot matrix lacks states/viewports/artifact directory | MEDIUM |
| No user browser flow for form/navigation/modal work | MEDIUM |
| No mobile contract for mobile-relevant form/navigation/modal/sheet work | MEDIUM |
| No accessibility baseline for interactive UI | LOW→MEDIUM based on risk |

## Rejection guidance

- `CRITICAL`: verdict `REJECTED` unless plan is revised.
- `MEDIUM`: usually `REJECTED` for UI-heavy work; `APPROVED_WITH_COMMENTS` only for trivial UI copy/icon changes with no interaction.
- `LOW`: can be `APPROVED_WITH_COMMENTS` if user value and QA route remain safe.

## Empirical basis

Plan 63 reached G9 with missing flow, wrong placement, and poor form quality. Critic needs explicit UI contract checks so these defects are rejected before implementation, not discovered by the user at G9.
