# Rule: Pre-CR Contract Gate (Allowlist + Tool/Action + Each-Item Proof)

PROC-NEW-92-1 | pidex-implementer

## Trigger

Any slice touching parser/contract surfaces, especially collection payloads with per-item schema rules.

## Rule

Before first code-review handoff, implementation doc MUST include `Pre-CR Contract Gate` block with:

1. Allowlist proof: accepted top-level keys and rejected extras.
2. Tool/action proof: exact action taxonomy and allowed values/assertions.
3. Each-array-item validation proof: evidence checks run across all items, not first item only.

Required evidence format per row:

- command or test file reference
- assertion target
- pass/fail snippet

## Fail Criteria

Handoff not ready if any gate row missing, or if evidence proves only first-item validation.

## Validation

Reviewer verifies gate block exists and traces each row to executable test/assertion evidence.