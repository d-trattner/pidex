# Contract-Coherence Preflight (PROC-NEW-93-1)

Trigger: contract/parser/lifecycle route work before first review handoff.

## Gate timing

Run preflight after first GREEN on contract surface, before first handoff to pidex-code-reviewer.

## Required checks

1. Status vocabulary coherence: assertions use one lane per case (lifecycle `ok/conflict/unavailable` or legacy HTTP lane), no mixed acceptance in same assertion.
2. Version lane coherence: version token/path/fixture names align with plan lane (`v2` vs `legacy`), no cross-lane alias drift.
3. Route string coherence: router declarations, tests, fixtures, docs use same canonical route strings.

## Evidence required

Implementation doc section `Contract Coherence Preflight` with checklist + grep/test snippets proving each check.

## Fail condition

Any mismatch unresolved: do not request first review. Fix or mark BLOCKED with mismatch list.
