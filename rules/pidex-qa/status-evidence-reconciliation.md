# Rule: QA Status / Evidence Reconciliation

PROC-NEW-QA-STATUS-RECONCILE | pidex-qa / orchestrator

## Rule

QA artifact status must match final evidence and final ROUTING.

If QA initially emits `BLOCKED` because browser/runtime evidence is unavailable, and the orchestrator or a continuation later adds the missing evidence, the same QA artifact must be patched before routing onward.

Required updates in the same `context_file`:

1. Frontmatter/status line updated or a prominent `Final QA Status` section added.
2. Changelog row documenting transition, e.g. `BLOCKED -> COMPLETE via orchestrator browser evidence`.
3. Evidence section listing commands/artifacts/screenshots.
4. Final ROUTING block updated to match final status.

## Blocker

QA must not route `COMPLETE` while the artifact still presents terminal `QA Blocked` as the current status without an explicit final override. Orchestrator must not route to UAT until status/evidence are reconciled.

## Recommended final section

```text
## Final QA Status
- Current: COMPLETE
- Prior blocked reason: <reason>
- Resolution: <evidence source>
- Artifacts: <paths>
```

## Why

Plan 4 dashboard parity had QA docs marked blocked after orchestrator supplied browser evidence. UAT/devops had to reason around contradictory artifact status. This rule makes QA artifact the single source of truth.
