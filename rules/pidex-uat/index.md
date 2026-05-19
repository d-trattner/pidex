# pidex-uat Rules Index

Last updated: 2026-04-27 (PROC-NEW-44c)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Structural Code Search Default | [../shared/structural-code-search.md](../shared/structural-code-search.md) | PROC-AST-GREP-1 | Prefer ast-grep for structural code searches; use rg for literal text and document the chosen search evidence |
| G9 Port in Context | [g9-port-in-context.md](g9-port-in-context.md) | 44c | UAT doc Preview Instructions must state exact dev server port; orchestrator propagates to G9 --context string |
| UI Evidence Required Before G9 | [ui-evidence-before-g9.md](ui-evidence-before-g9.md) | UI-EVIDENCE-G9 | UI/G9 plans need browser evidence, screenshots, user flow, mobile/a11y evidence, and required designer audit before G9 routing |
| Visual Proof Before G9 | [visual-proof-before-g9.md](visual-proof-before-g9.md) | UI-VISUAL-PROOF | UAT must verify QA evidence proves exact visual claims before G9/release approval |
| Semantic UI Fit Check | [semantic-ui-fit.md](semantic-ui-fit.md) | UI-SEMANTIC-FIT | UAT checks user-intent class, preserve/forbidden changes, and likely user surprise before G9 |
| Visible Text Semantic Check | [visible-text-semantic-check.md](visible-text-semantic-check.md) | PIPELINE-ANALYST-1C | UAT verifies important visible text matches approved label/source contracts before G9 |

## How to use

Read this index at task start. Load specific rule files when relevant to current task.
