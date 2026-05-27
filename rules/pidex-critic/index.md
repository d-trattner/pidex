# pidex-critic Rules Index

Last updated: 2026-04-28 (PROC-NEW-48-1)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Structural Code Search Default | [../shared/structural-code-search.md](../shared/structural-code-search.md) | PROC-AST-GREP-1 | Prefer ast-grep for structural code searches; use rg for literal text and document the chosen search evidence |
| Local Operator Config Guard | [../shared/local-operator-config-guard.md](../shared/local-operator-config-guard.md) | PROC-LOCAL-CONFIG-1 | Plans touching mutable settings must separate tracked public defaults from ignored local operator overrides |
| Binding Fixture Semantic Check | [binding-semantic-check.md](binding-semantic-check.md) | X3 | Verify fixture identifiers are semantically correct domain names, not pipeline names |
| Dep-Pruning Lockfile Check | [dep-pruning-lockfile-check.md](dep-pruning-lockfile-check.md) | 23 | Flag as BLOCKING any dep-pruning slice missing explicit lockfile regeneration step |
| PIF Resolution Path Check | [pif-resolution-path-check.md](pif-resolution-path-check.md) | 24 | Flag as BLOCKING any PIF item in scope without "Resolution approach confirmed:" annotation |
| MSW Handler Scope Check | [msw-handler-scope-check.md](msw-handler-scope-check.md) | 36b | Flag as BLOCKING if plan adds both new route and MSW handler without explicit scope decision |
| MSW Test-Local Registration Check | [msw-test-local-registration.md](msw-test-local-registration.md) | 44a | Flag as BLOCKING if plan declares test-local MSW scope but does not name the component test file and explicit server.use() sub-task |
| Version-Label CRITICAL Resolution Path | [version-label-resolution-path.md](version-label-resolution-path.md) | 47-1 | When raising a version CRITICAL, classify as Path A (label-only, orchestrator resolves via briefing) or Path B (scope-impacting, planner loop required) |
| HOW-Leakage Positive/Negative Examples | [how-leakage-examples.md](how-leakage-examples.md) | 48-1 | Type names, module paths, prose descriptions = acceptable; backtick-fenced executable code blocks = violation |
| UI Quality Contract Check | [ui-quality-contract-check.md](ui-quality-contract-check.md) | UI-QUALITY-CONTRACT | UI plans require G9 declaration, browser smoke AC, pattern source, screenshot matrix, browser flow, and a11y baseline |
| Execution Profile Safety Check | [execution-profile-safety-check.md](execution-profile-safety-check.md) | EXECUTION-PROFILE-SAFETY | Critic verifies execution profile and skipped-agent declarations are present and safe |
| Retro Mode Safety Check | [retro-mode-safety-check.md](retro-mode-safety-check.md) | RETRO-MODE-SAFETY | Critic verifies none/mini/full retro mode and post-retro handoffs are safe for risk |
| UI Intent + Proof Contract Check | [ui-intent-proof-contract-check.md](ui-intent-proof-contract-check.md) | UI-INTENT-PROOF | Reject UI plans with ambiguous placement, missing visual proof criteria, table checklist, or copy semantics contract |
| Enumeration Completeness Check | [enumeration-completeness-check.md](enumeration-completeness-check.md) | PIPELINE-ANALYST-1D | Plans with fixed domains/states/steps must bind every enumerated item or declare applies-to-all behavior |
| Secondary Lane Write Fence | [secondary-lane-write-fence.md](secondary-lane-write-fence.md) | PARALLEL-LANE-WRITE-FENCE | Secondary critic lanes may write only their expected secondary artifact; deferred findings stay in the secondary artifact for merge/adjudication, not `wiki/open-items.md` |

## How to use

Read this index at task start. Load specific rule files when relevant to current task.
