# Post-Push Release Coherence Checklist

PROC-NEW: 027-PI-1

## Trigger
Stage 2 release path after push/tag success and before declaring release closed.

## Rule
Run mandatory closure checklist:
1. Remote proof present (tag exists on `origin`; release commit reachable on `origin/main`).
2. Roadmap release row status coherent with shipped state.
3. Project wiki/open-items updated for residual follow-ups.
4. Retrospective + PI artifacts exist (or explicit `NOT_CONFIGURED` reason documented).

## Evidence
Deployment doc must include line:
`Post-push coherence checklist: PASS|FAIL` with failed item list when FAIL.

## Fail condition
Any checklist item missing/mismatched blocks release closure; route for reconciliation before COMPLETE.
