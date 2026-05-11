# Rule: Orchestrator CRITICAL-Finding Log Entry

**PROC-NEW:** 47-1 (companion to pidex-critic version-label-resolution-path)
**Applies to:** orchestrator (when resolving critique CRITICAL via briefing note, Path A)
**Added:** 2026-04-28

## Rule

When the orchestrator resolves a critique CRITICAL finding via briefing note rather than triggering a planner revision loop (Path A per pidex-critic `version-label-resolution-path.md`), the orchestrator **must** append a one-line changelog entry to the plan doc before spawning the implementer.

## Changelog Entry Format

Add a row to the plan doc's changelog table:

```
| <YYYY-MM-DD> | Critique C-<N> resolved: <one-line description>; plan not amended — implementer briefed directly | pidex-orchestrator |
```

Example (Plan 47):
```
| 2026-04-27 | Critique C-1 resolved: version label corrected from v0.9.8 to v0.10.1; plan body not amended — implementer briefed with correct target | pidex-orchestrator |
```

## Why This Matters

When a critique CRITICAL is resolved without a plan amendment, the closed plan doc retains stale metadata. A future reader (or pidex-planner revisiting the plan as a reference) sees inconsistent version numbers without context. The changelog entry closes the paper trail gap.

**Anti-pattern (Plan 47 actual):** C-1 resolved via briefing note, no changelog entry appended. QA doc had to note "benign spec inconsistency" to explain the v0.9.8/v0.10.1 conflict visible in the plan body.

## Scope

This rule applies to ANY critique CRITICAL resolved via orchestrator briefing note, not just version mismatches. If the orchestrator ever resolves a C-N security finding, scope finding, or missing section via briefing note instead of a planner loop, the same log entry is required.
