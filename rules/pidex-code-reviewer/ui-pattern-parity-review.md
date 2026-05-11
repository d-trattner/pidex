# Rule: UI Pattern Parity Review

PROC-NEW-UI-PATTERN-PARITY | pidex-code-reviewer

## Trigger

Load when plan or implementation touches visible UI, especially when plan contains `UI Quality Contract`, `UI Pattern Source`, screenshot matrix, or pattern parity requirement.

## Rule

Code review must verify implementation honors the plan's UI pattern source contract before QA spends browser time. This is code/design parity review, not visual QA.

## Required checks

For each UI surface in the plan:

1. Read plan `UI Quality Contract` / `UI Pattern Source`.
2. Read named source pattern file(s) or route/component when available.
3. Read implemented target files.
4. Compare at least:
   - placement in page/shell hierarchy
   - labels/copy/helper text/error text
   - interaction states: disabled/loading/error/empty/success
   - validation and persistence/reload expectations when data is involved
   - keyboard/focus hooks for forms/dialogs/drawers/menus
   - mobile/overlay structure when relevant
5. Verify screenshot artifact path expectations are preserved for QA; do not require actual screenshots at code-review unless implementation/design doc already claims them.

## Findings

| Issue | Severity |
|---|---|
| UI Quality Contract ignored entirely | MAJOR |
| Existing pattern source named but target omits key placement/flow parity | MAJOR |
| Form lacks required validation/error/loading/disabled state from contract | MAJOR |
| Label/copy drift changes user meaning | MAJOR or MINOR based on impact |
| Screenshot matrix absent from implementation/QA handoff | MINOR; MAJOR for UI-heavy |
| Mobile/overlay contract omitted for UI-heavy | MAJOR |

## Required doc section

Add `UI Pattern Parity Review` to code review doc for UI plans:

```markdown
## UI Pattern Parity Review

| Surface | Source pattern checked | Target files checked | Parity result | Findings |
|---|---|---|---|---|
```

If no UI scope, write `N/A — no UI scope`.

## Routing impact

- MAJOR parity failures → `REJECTED`, route to `pidex-implementer`.
- Ambiguous design-source conflict → `BLOCKED` or route to `pidex-designer`.
- Minor screenshot/evidence handoff gaps may be `APPROVED_WITH_COMMENTS` only when QA gate still blocks missing evidence.

## Empirical basis

Plan 63 reached G9 with wrong placement and poor form quality after implementation. Code review can catch many parity misses before browser QA by comparing plan contract, source pattern, and target implementation.
