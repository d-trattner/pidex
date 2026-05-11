# Rule: Authority Change Full-Suite + Fixture Isolation Gate

PROC-NEW-2 | pidex-qa

## Trigger
Implementation changes artifact/path/resolver authority contract.

## Requirement
Run full-suite early in Phase 2 (before late-cycle polish checks). Require fixture isolation evidence:
- tests use explicit test-root override
- runtime artifact path unchanged
- no cross-test artifact leakage

## Decision
- Evidence + full-suite green => continue QA flow.
- Missing isolation proof or full-suite fail => QA FAILED/BLOCKED. Return to pidex-implementer.
