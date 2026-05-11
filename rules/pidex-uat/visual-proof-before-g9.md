# Visual Proof Before G9

Before UAT routes a UI-heavy, UI-parity, or G9-corrective plan to G9/release, UAT MUST verify that QA evidence proves the exact visual claim.

## Required checks

Review QA's `Visual Proof Sufficiency` section and confirm:

- each user-visible placement/table/layout claim has selector or DOM evidence;
- screenshots prove the intended container boundary and placement relation;
- mobile proof exists when mobile/responsive behavior is in scope;
- table/list claims include column/wrap/overflow/action evidence;
- console noise is classified and does not hide a product blocker.

## Blocking rule

UAT MUST NOT approve G9/release when the chain says only "screenshots attached" but does not prove the disputed claim. Route back to `pidex-qa` for evidence collection, or to `pidex-planner`/`pidex-designer`/`user` when visual intent is still ambiguous.

## UAT doc section

Add under UI evidence:

```markdown
### Visual Proof Sufficiency
- Exact placement proof: PASS/FAIL
- Container boundary proof: PASS/FAIL
- Mobile/table proof: PASS/FAIL/N/A
- Console classification: PASS/FAIL
- Decision: G9 READY / BLOCKED
```
