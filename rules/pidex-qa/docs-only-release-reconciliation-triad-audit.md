# Docs-Only Release Reconciliation Triad Audit

PROC-NEW: 027-PI-3

## Trigger
QA on docs-only release reconciliation plans.

## Rule
Before `QA Complete`, audit triad:
1. **Tag proof**: remote tag exists and points to declared release commit.
2. **Roadmap proof**: roadmap release status matches shipped/tagged truth.
3. **Dirty-tree provenance**: pre/post commit dirty-tree evidence recorded; staged docs traceable to plan scope.

## Output macro
Add QA section `Release Reconciliation Triad Audit` with rows `Tag|Roadmap|DirtyTree` and taxonomy token `PASS|FAIL|SKIPPED|NOT_CONFIGURED|BLOCKED`.

## Fail condition
Any triad row FAIL/BLOCKED => no `QA Complete`; route back with mismatch evidence.
