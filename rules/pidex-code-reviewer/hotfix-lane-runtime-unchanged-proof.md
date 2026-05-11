# Rule: Hotfix Lane Runtime-Unchanged Proof

PROC-NEW-3 | pidex-code-reviewer

## Trigger
Post-QA narrow-diff hotfix lane claims runtime unchanged.

## Requirement
Before APPROVED, review doc must include hotfix lane proof block:
- runtime surface unchanged proof (files/scope)
- targeted test run result (changed scope)
- full-suite run result (regression guard)

## Enforcement
If runtime-unchanged claim lacks proof or test pair missing, verdict cannot exceed APPROVED_WITH_COMMENTS.
