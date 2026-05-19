# Rule: Route-Service Branch Risk Command

PROC-NEW-7-2 | pidex-qa

## Trigger
Plan touches route/service files and error/risk branches remain unproven by existing test suites.

## Rule
After implementation, QA MUST run one dedicated branch-risk command bundle before `QA COMPLETE`:

1. Targeted route/service branch-risk command for changed files (exact test command logged).
2. Assertion block for EACCES/read-error branch output shape.
3. Branch payload assertions must include at least `status`, `next_action`, and `error_code`/`category` fields.

## Required evidence
- Command transcript (stdout/stderr) and exit status.
- Branch assertion checklist: `EACCES`, `read-error`, `success`.
- Canonical token: `PASS/FAIL/SKIPPED/NOT_CONFIGURED/BLOCKED`.

## Fail condition
If branch-risk command not executed or assertions are missing, QA must file follow-up and keep QA incomplete.

## Scope guard
If no route/service file changed in plan, set this rule `SKIPPED (NOT_APPLICABLE)` and cite file list.
