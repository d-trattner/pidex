# Rule: Layout-Parity DOM Snapshot

PROC-NEW-034-1 | pidex-implementer

## Trigger

Any implementation slice where task says "match", "mirror", "follow layout of", or "parity with" a named page or component.

## Rule

Before writing any layout code for a parity task:

1. **Snapshot DOM of reference element** — read or render the named reference page/component; identify the exact HTML element (e.g., `<aside>`, `<nav>`, `<div class="...">`) that is the canonical source
2. **Never copy from a sibling page** — sibling pages (e.g., `/pipeline` when plan says `/projects`) may themselves be wrong or diverged; always go to the named canonical source
3. **Confirm class list matches** — before proceeding to tests, compare implemented element's class list to reference element's class list; document mismatch as a blocker

## Required implementation-doc evidence

```
Layout-Parity Reference:
- Plan-specified source: <page/component>
- Canonical element: <HTML element tag>
- Key classes: <class list from source>
- Verified: yes / no (blocker if no)
```

## Invalid behavior

- Implementing layout by copying from nearest-looking sibling page instead of named reference
- Skipping class-list verification and assuming visual similarity is sufficient
- Using plan's page name alone without identifying the specific element

## Failure mode prevented

Plan 034: 3 G9 fix cycles because implementer used `/pipeline <aside>` as reference when plan specified `/projects <aside>`. Both are shell-layout pages; pipeline sidebar had diverged. DOM snapshot at reference element would have caught mismatch before first G9 rejection.
