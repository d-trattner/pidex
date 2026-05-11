# Rule: Version-Label CRITICAL Resolution Path

**PROC-NEW:** 47-1
**Applies to:** pidex-critic (classification), orchestrator (resolution decision)
**Added:** 2026-04-28

## Rule

When pidex-critic raises a CRITICAL finding for version label mismatch (plan targets a version that differs from current `package.json` or deployment context), the critique doc **must classify the finding** using one of two resolution paths:

### Path A — Orchestrator-Direct (safe shortcut)

Conditions (ALL must be true):
1. The mismatch is **version label only** — the plan's logic, scope, and architecture are correct for the current codebase state.
2. The stale version appears **only in metadata fields** (plan frontmatter `Target Release`, `§Version Management`, or slice deliverable tables) — not in business logic, migration steps, or integration contracts.
3. No scope items would change if the correct version were substituted (i.e., the plan is implementation-correct, not scope-incorrect).

Resolution: Orchestrator resolves by passing corrected version target in the implementer briefing note. **No planner revision loop.** Orchestrator must also append a one-line changelog entry to the plan doc (see PROC-NEW-47-3 / `orchestrator-critical-finding-log.md` in pidex-planner rules).

### Path B — Planner Revision Loop Required

Conditions (ANY triggers Path B):
- Version mismatch implies a scope difference (e.g., plan was written for an older release that excluded a feature now present in the codebase).
- Stale version is referenced in migration logic, schema version checks, or integration contracts — not just label metadata.
- The critic cannot determine whether the mismatch is label-only without reading the codebase beyond the plan doc.

Resolution: Critique verdict is REJECTED. Orchestrator routes back to pidex-planner for a plan amendment before proceeding.

## Classification in Critique Doc

When raising a version CRITICAL, include a one-line classification:

```
C-1: Version target mismatch (plan: v0.9.8, current: v0.10.0)
Resolution path: PATH A — label-only mismatch, scope unaffected. Orchestrator may resolve via briefing note.
```

or

```
C-1: Version target mismatch (plan: v0.9.8, current: v0.10.0)
Resolution path: PATH B — mismatch implies scope difference in §Migration Logic. Planner revision required.
```

## Rationale

Validated in Plan 47: C-1 was Path A. Orchestrator resolved via briefing note with zero planner loop. The plan doc retained stale metadata but the implementation was correct. Path A is safe when version is a label, not a logic constraint. Path B is required when version drives behavior.
