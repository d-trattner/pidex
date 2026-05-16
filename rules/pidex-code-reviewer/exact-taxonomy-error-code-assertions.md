# Rule: Exact Taxonomy/Error-Code Assertions for Contract Scope

PROC-NEW-92-3 | pidex-code-reviewer

## Trigger

Review includes error-contract, status taxonomy, or action taxonomy scope.

## Rule

Assertions for taxonomy/error-code contracts must be exact and deterministic.

Reject ambiguous patterns:

- broad matches (`toBeTruthy`, `contains("error")`, regex buckets) for contract codes.
- accepting multiple unrelated codes in one assertion.
- assertions that verify only message text while skipping code/taxonomy field.

Required checks:

- exact expected code/token asserted per scenario.
- conflict/error scenarios map one-to-one with declared contract taxonomy.
- negative tests assert wrong-code rejection path.

## Enforcement

If contract scope present and assertions are ambiguous, record **Major+** finding and reject until exact assertions added.

## Rationale

Ambiguous assertions masked contract drift and delayed defect detection.