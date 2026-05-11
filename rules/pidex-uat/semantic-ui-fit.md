# pidex-uat Rule — Semantic UI Fit Check

## Trigger

UI-involved work, especially existing-screen changes, UI-heavy plans, or any run with a UI Preservation Classification.

## Required UAT section

```md
## Semantic UI Fit
| Check | Result | Notes |
|---|---:|---|
| User intent class respected | PASS/FAIL | A/B/C/D/E + explanation |
| Must-preserve items unchanged | PASS/FAIL/N/A | cite screenshots/tests |
| Forbidden changes absent | PASS/FAIL/N/A | cite evidence |
| Previous visible behavior compared | PASS/FAIL/N/A | source screen/files |
| Potential user surprise | none/list | explain risk |
| Temporary designer preview honored | PASS/FAIL/N/A | URL/artifact/decision |
```

## Rule

UAT must evaluate whether the implementation matches the user's likely UI intent, not only whether it matches the written acceptance checklist.

If UAT sees substantial UI/IA drift from the source-of-truth screen and the plan did not explicitly authorize that drift, route to pidex-designer or pidex-planner before G9.

## Non-goal

This is not a replacement for browser evidence, QA screenshots, or Daniel's final G9 approval. It is a semantic sanity check to avoid preventable late loops.
