# Visible Text Semantic Check

PROC-NEW: PIPELINE-ANALYST-1C

## Trigger

UI/G9 work with a `UI Label Source Contract`, repeated/hierarchical UI, status badges, table/list rows, steppers, lifecycle cards, or any plan where visible labels derive from specific fields/constants.

## Required UAT section

```md
## Visible Text Semantic Check
| Surface / element | Expected text/source | Evidence | Result |
|---|---|---|---|
| Step mini-card title | semantic step label from PHASE_STEPS.label | screenshot/DOM text | PASS/FAIL |
```

## Rule

UAT must verify not only that screenshots/selectors exist, but that important visible text matches the approved source-of-truth label contract.

If the plan lacks a label-source contract but the UI clearly has repeated/hierarchical labels, UAT should flag a semantic-fit risk before G9.

## Non-goal

Do not require exhaustive text verification for trivial copy-only or icon-only changes. Focus on labels that affect user understanding, status, navigation, or hierarchy.
