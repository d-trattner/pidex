# pidex-security Rules Index

Last updated: 2026-05-01 (PROC-NEW-61-SEC)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Structural Code Search Default | [../shared/structural-code-search.md](../shared/structural-code-search.md) | PROC-AST-GREP-1 | Prefer ast-grep for structural code searches; use rg for literal text and document the chosen search evidence |
| Package Manager Equivalence | [../shared/package-manager-equivalence.md](../shared/package-manager-equivalence.md) | PROC-PACKAGE-MANAGER-1 | Use detected package-manager equivalents; pnpm native/default, npm compatibility, yarn/bun unsupported; avoid lockfile type changes and npx auto-downloads |
| Schema Integrity Checklist for Lineage Links | [schema-integrity-checklist.md](schema-integrity-checklist.md) | PROC-NEW-004-2 | New persistent lineage/security-trace links require NOT NULL/FK/mismatch-guard/negative-test evidence |
| Fallow Structural Signal (JS/TS) | [fallow-structural-signal.md](fallow-structural-signal.md) | 61-SEC | For JS/TS scope, run fallow once as supporting structural signal and record evidence or FALLOW-SKIP rationale |

## How to use

Read this index at task start. Load specific rule files when relevant to current task.
