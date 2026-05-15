# Rule: UI Evidence Required Before G9

PROC-NEW-UI-EVIDENCE-G9 | pidex-uat

## Trigger

Load for any UAT where Gate G9 is required or the plan changes visible UI.

## Rule

UAT MUST NOT approve routing to G9 or mark `UAT COMPLETE` unless the doc chain contains UI browser evidence. G9 is final human confirmation, not the first visual test.

## Required evidence before G9

For UI/G9-required plans, verify QA/design docs include:

- QA Browser-Level Smoke section with PASS/COMPLETE status
- desktop screenshot artifacts for main contract paths
- mobile screenshot artifacts for responsive contract paths (or explicit `N/A` only when plan declares mobile not applicable)
- user browser flow executed, not only route loaded
- console error check result
- network failure / 401 / 403 / 5xx check result for API-backed or navigation flows
- final URL or visible route-state assertion for navigation flows
- mobile viewport evidence when plan requires mobile/responsive behavior
- accessibility baseline evidence for interactive UI
- post-implementation designer audit result when design review required one
- if prior G9 was rejected: exact G9 Rejection Repro Contract flow passed in live Playwright evidence

## UAT handling

| Evidence state | UAT action |
|---|---|
| Complete and passing | UAT may approve and route to `pidex-devops`, `gate: G9` |
| Missing browser evidence | `BLOCKED`, route to `pidex-qa` or `user`/orchestrator for browser evidence collection |
| Browser evidence missing but required desktop/mobile evidence not collected | `BLOCKED`, keep evidence in handoff before any `UAT COMPLETE` |
| Browser evidence fails | `REJECTED`, route to `pidex-implementer` with evidence |
| Designer audit required but missing | `BLOCKED`, route to `pidex-designer` |

## UAT doc requirement

Add `## UI Evidence Before G9` section for every G9-required plan:

- Browser evidence: PASS / MISSING / FAIL
- Desktop evidence: PASS / MISSING / FAIL
- Mobile evidence: PASS / N/A / MISSING / FAIL
- Screenshots: list artifact paths or `MISSING`
- User flow: executed flow summary or `MISSING`
- Designer audit: PASS / N/A / MISSING
- Decision: G9 READY / BLOCKED / REJECTED

If `Decision != G9 READY`, UAT status is `UAT BLOCKED`/`UAT Failed`; do not set `UAT Complete`.

If a prior G9 rejection exists and exact live Playwright repro evidence is absent, UAT MUST block G9 and route to `pidex-qa` or `orchestrator`; G9 must not be used as the next test attempt.

## Empirical basis

Plan 63 used G9 as the first reliable visual check and required repeated user rejection loops. UAT must verify browser/screenshot/design evidence before preview so G9 confirms quality rather than discovering basic UI defects.
