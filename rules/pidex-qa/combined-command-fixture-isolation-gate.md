# Combined Command Fixture Isolation Gate (PROC-NEW-3)

## Scope
For `pidex-qa` when implementation touched fixture/catalog artifact files.

## Trigger
QA plan includes fixture/catalog artifact edits.

## Rule
QA CLOSE/COMPLETE requires PASS|FAIL|BLOCKED evidence rows for:

- `combined_command_parity`
  - combined command from implementer run reproduced in QA artifact set and output present
- `artifact_root_isolation`
  - evidence that fixtures and catalog were isolated by root/artifact scope
- `cross_command_consistency`
  - focused + combined command produced consistent pass/fail outcomes

Status tokens: `PASS`, `FAIL`, `BLOCKED`.

## Fail condition
- Any required key absent => QA outcome remains BLOCKED until supplied.
- If combined command is not run and fixtures/catalog were modified, QA COMPLETE is invalid.
