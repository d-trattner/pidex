# Rule: CHANGELOG Ordering in Release-Prep Slices

PROC-NEW-X2 | pidex-implementer

## Rule

**CHANGELOG entry is the FIRST file written in any release-prep slice — before any package.json or version bump.**

Required order:
1. Write CHANGELOG entry
2. Bump shell.tsx (or equivalent version display)
3. Bump package.json files
4. Single commit when version table consistent

## Why

Budget cutoff after step 1 leaves green suite + missing version bumps (recoverable). Skipping CHANGELOG risks MAJOR finding in code review — reviewer cannot verify changelog matches changes without it.

## Anti-pattern

Writing version bumps first, then CHANGELOG, then getting budget-cut before CHANGELOG is written. Leads to: code review MAJOR finding for missing/incomplete changelog.
