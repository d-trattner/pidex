# Rule: Layout Parity — Exact Element Reference

PROC-NEW-034-2 | pidex-planner

## Trigger

Any plan with a layout-parity task: "match", "mirror", "follow layout of", "stay consistent with" a named page or component.

## Rule

Layout parity instructions must specify the exact element path, not just the page name.

**Minimum required specification:**

```
Layout parity source: <route> → <element-selector> [key classes if known]
```

Examples:
- ✓ `/projects → <aside> — hidden md:flex flex-col w-52 border-r shrink-0 overflow-y-auto`
- ✓ `/projects → <aside> (read classes from source at plan time)`
- ✗ "match the projects sidebar"
- ✗ "follow the shell layout"

## When class list is unknown at plan time

If plan is written before implementer reads source, write:

```
Layout parity source: /projects → <aside> (implementer must snapshot exact class list before writing code — see pidex-implementer layout-parity-dom-snapshot rule)
```

Do not leave reference as page-name-only. Named element is minimum; class list is preferred.

## Why element, not just page

A page may contain multiple candidate elements (sidebar, nav, content div). Sibling pages often use the wrong candidate or have already diverged. Page name alone enables wrong-reference failures that survive code review.

## Failure mode prevented

Plan 034: 2 of 3 G9 rejection cycles traced to implementer using `/pipeline <aside>` instead of `/projects <aside>`. Plan said "match the sidebar" with no element specification. Wrong reference went through code review uncaught.
