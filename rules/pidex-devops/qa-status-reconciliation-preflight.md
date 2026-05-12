# Rule: QA Status Reconciliation Preflight

PROC-NEW-DEVOPS-QA-STATUS | pidex-devops

## Rule

Before local/release readiness, devops must verify QA artifact status is consistent with final ROUTING and downstream UAT decision.

If QA docs contain both blocked language and complete/approved routing, devops must classify the state:

- `PASS`: QA status/evidence/ROUTING align.
- `RECONCILED`: QA has a final override section explaining prior blocked state and completion evidence.
- `BLOCKED`: QA still says blocked with no final override, but UAT/release is trying to proceed.

## Required action

If `BLOCKED`, route to `pidex-qa` or orchestrator to patch the QA artifact before release readiness. Do not silently continue with contradictory QA status.

## Evidence line

Deployment doc must include:

```text
QA status reconciliation: PASS|RECONCILED|BLOCKED — <doc path + reason>
```

## Why

Plan 4 dashboard parity reached devops with a QA artifact that still looked blocked despite added browser evidence. Devops noted the mismatch but continued. This preflight makes the mismatch an explicit blocker unless reconciled.
