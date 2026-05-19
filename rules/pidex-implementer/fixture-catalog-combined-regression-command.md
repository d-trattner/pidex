# Fixture-Catalog Combined Regression Command (PROC-NEW-2)

## Scope
For `pidex-implementer` when editing fixture or catalog artifact files (including combined fixture/catalog lists).

## Trigger
Any slice that modifies or deletes:
- fixture files
- catalog files

## Rule
Before first CR handoff, run both commands and record output:

1. Focused slice command (explicitly listing touched scope)
2. Combined command: `npm run test -- fixture:catalog-combined-regression --fixture-root=<fixture-root>`

### Required evidence
- command list in `IMPLEMENTATION` or equivalent doc
- combined command output or log hash
- artifact-root isolation path used for the run

## Fail condition
- combined regression command omitted or pass/fail proof missing => keep item `RED/FAILED` and do not hand off.
- Must use this rule for fixture/catalog artifact edits, not only unit-slice test files.
