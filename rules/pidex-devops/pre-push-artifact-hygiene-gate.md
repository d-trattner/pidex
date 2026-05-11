# Pre-Push Artifact Hygiene Gate

PROC-NEW: 71-3

## Trigger
Stage 2 release flow (`push` decision) or any devops action preparing remote push.

## Rule
Before push, run hygiene gate:
1. `git status --short` reviewed.
2. Block transient/runtime dirs from commit (`.tanstack/`, framework temp caches, ad-hoc evidence dumps outside ignored artifact dirs).
3. If transient paths appear tracked/staged, stop and route back for cleanup.
4. If repo policy gap found, record recommended `.gitignore`/guard update in deployment doc.

## Evidence
Deployment doc line `Artifact hygiene gate: PASS|FAIL` plus blocked path list when FAIL.
