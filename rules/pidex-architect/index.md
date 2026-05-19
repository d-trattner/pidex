# pidex-architect Rules Index

Last updated: 2026-05-18 (PROC-NEW-7-3)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Structural Code Search Default | [../shared/structural-code-search.md](../shared/structural-code-search.md) | PROC-AST-GREP-1 | Prefer ast-grep for structural code searches; use rg for literal text and document the chosen search evidence |
| Security + API Contract Preflight | [security-api-contract-preflight.md](security-api-contract-preflight.md) | 60-1 | For route/contract changes, findings must include explicit auth boundary, contract mapping, and scripted verification bindings before APPROVED verdict |
| Boundary Error Conversion Note | [boundary-error-conversion-note.md](boundary-error-conversion-note.md) | PROC-NEW-7-3 | Plans touching boundary error conversion must document typed conversion helper policy, deterministic next_action/category mapping, and reusable note snippet |
| Scripted Validation Matrix | [scripted-validation-matrix.md](scripted-validation-matrix.md) | ARCH-SCRIPTED-VALIDATION | User-visible behavior requires scripted non-interactive verification; no manual-optional loopholes |
| ADR Creation Boundary | (inline in agent .md) | 5 | Do NOT write ADRs unless briefing explicitly says so; tag ADR-CANDIDATE inline instead |

## Notes

PROC-NEW-5 (ADR-creation boundary) is structurally core to how pidex-architect conserves tool budget. Remains inline in agent .md.

## How to use

Read this index at task start. Load specific rule files when relevant to current task.
