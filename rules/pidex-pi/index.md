# pidex-pi Rules Index

Last updated: 2026-09-13 (PI mode/decision contract alignment)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Structural Code Search Default | [../shared/structural-code-search.md](../shared/structural-code-search.md) | PROC-AST-GREP-1 | Prefer ast-grep for structural code searches; use rg for literal text and document the chosen search evidence |
| Provider-Safe Defensive Review Language | [../shared/provider-safe-defensive-review-language.md](../shared/provider-safe-defensive-review-language.md) | PROC-PROVIDER-SAFE-1 | Frame authorized local reviews as concrete defensive invariants; compact refusal recovery preserves findings and gates |
| Validation Taxonomy Standard | [validation-taxonomy.md](validation-taxonomy.md) | 3 | Standardize validation status tokens: PASS/FAIL/SKIPPED/NOT_CONFIGURED/BLOCKED across PI/release artifacts |
| PI Mode and User Decision Routing Consistency | [user-decision-routing-consistency.md](user-decision-routing-consistency.md) | PI-DECISION | Mode/decision matrix: producer completion returns to orchestrator; actual unresolved approval remains G7; headings alone are not decisions |
| Hold-Mode Handoff Manifest Bundle | [hold-sync-manifest-bundle.md](hold-sync-manifest-bundle.md) | 90-3 | PI hold handoff must include commit IDs, scoped manifest, and uncommitted artifact list before routing forward |

## How to use

Read this index during startup after the role's valid-metadata skeleton step. Always load the mode/decision rule; load other rules when relevant. Missing metadata uses the role's explicit clarification exception. No index rule grants retries, cleanup or write scope beyond the actual invocation.
