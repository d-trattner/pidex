# pidex-architect Rules Index

Last updated: 2026-05-01 (PROC-NEW-60-1)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Security + API Contract Preflight | [security-api-contract-preflight.md](security-api-contract-preflight.md) | 60-1 | For route/contract changes, findings must include explicit auth boundary, contract mapping, and scripted verification bindings before APPROVED verdict |
| Scripted Validation Matrix | [scripted-validation-matrix.md](scripted-validation-matrix.md) | ARCH-SCRIPTED-VALIDATION | User-visible behavior requires scripted non-interactive verification; no manual-optional loopholes |
| ADR Creation Boundary | (inline in agent .md) | 5 | Do NOT write ADRs unless briefing explicitly says so; tag ADR-CANDIDATE inline instead |

## Notes

PROC-NEW-5 (ADR-creation boundary) is structurally core to how pidex-architect conserves tool budget. Remains inline in agent .md.

## How to use

Read this index at task start. Load specific rule files when relevant to current task.
