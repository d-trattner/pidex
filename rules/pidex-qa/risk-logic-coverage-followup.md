# Rule: Risk-Logic Coverage Follow-up

PROC-NEW-61-3 | pidex-qa

## Trigger
Apply when plan changes risk-logic file(s) and branch coverage reported.

## Rule
If new/modified risk-logic file has branch coverage <50%, QA MUST file follow-up test task before QA COMPLETE / release close.

## Scope
- Applies only touched files in current plan.
- Legacy untouched files excluded.

## Required QA evidence
- Coverage value + file path.
- Follow-up task ID/location (open-items/backlog).
- Statement whether follow-up blocks release (default non-blocking unless plan/security gate says otherwise).

## Gate
No QA COMPLETE when trigger met and follow-up task absent.

## Why
Prevents silent carry-forward of fragile error/risk branches.
