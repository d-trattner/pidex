# pidex-designer Rules Index

Last updated: 2026-04-26 (PROC-NEW-41b)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Structural Code Search Default | [../shared/structural-code-search.md](../shared/structural-code-search.md) | PROC-AST-GREP-1 | Prefer ast-grep for structural code searches; use rg for literal text and document the chosen search evidence |
| Must-Fix Callout | (inline in agent .md — see PROC-NEW-11) | 11 | Medium+ findings get Must-Fix section at top of review doc |
| Fixed Chrome Geometry Audit | [fixed-chrome-geometry.md](fixed-chrome-geometry.md) | 1 (Plan 38) | When a plan adds a fixed/sticky element, table all fixed-chrome at that breakpoint and flag overlap conflicts |
| Draft ROUTING Block Cleanup | [draft-routing-cleanup.md](draft-routing-cleanup.md) | 41b | Final ROUTING block must overwrite IN_PROGRESS draft using Edit; do not append both blocks in the same doc |
| UI-Heavy Designer Required | [ui-heavy-required.md](ui-heavy-required.md) | UI-HEAVY-DESIGNER | UI-heavy plans require pre-implementation designer specs and may require post-implementation screenshot audit before QA/UAT |
| Disposable Design Snippet Preview | [design-snippet-preview.md](design-snippet-preview.md) | UI-DESIGN-PREVIEW | Designer can create temporary HTML previews with localhost/LAN URL before implementation |

## Notes

PROC-NEW-11 (Must-Fix Before Commit section) is structurally core to the design review doc format and remains inline in the agent .md. No separate rule file needed — it's part of the output format contract.

## How to use

Read this index at task start. Load specific rule files when relevant to current task.
