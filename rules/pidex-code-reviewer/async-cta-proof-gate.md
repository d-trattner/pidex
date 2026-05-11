# Async CTA Proof Gate

PROC-NEW: 80-1

## Rule
Before verdict `APPROVED`, review evidence must include one async CTA proof row for each new/changed async CTA.

Required row fields:
- loading label/state visible while request pending
- CTA disabled during pending state
- duplicate-click blocked (single request / single side effect)

## Enforcement
Missing any field => not approvable. Return findings. Keep verdict below APPROVED.
