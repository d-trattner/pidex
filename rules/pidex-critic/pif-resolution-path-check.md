# Rule: PIF Item Resolution Path Check

PROC-NEW-24 | pidex-critic

## Rule

**Flag as BLOCKING any PIF (Plan Item Forward) item that is listed in-scope in the plan but lacks an explicit "Resolution approach confirmed:" annotation.**

A PIF item is a deferred item from a previous plan. Including a PIF item in scope without a confirmed implementation approach means the planner is scheduling work that may have no safe execution path — the same root cause as G1 triggers.

## Check

For every plan reviewed, scan for:
- Items explicitly labeled as PIF (e.g., "PIF-24-2", "PIF from Plan N")
- References to deferred work from previous plans brought into scope
- Items described as "previously deferred" or "carried forward from v0.X.Y"

For each PIF item found **in scope** (not explicitly listed as out-of-scope):

1. Verify the plan contains a "Resolution approach confirmed:" annotation for that item — a sentence or section that describes the specific implementation approach.
2. If missing: flag as BLOCKING.

## Finding format

```
Finding: PIF item in scope without confirmed resolution path
Severity: BLOCKING
Item: <PIF item name/ID>
Details: Plan includes PIF item <name> in scope but does not annotate a confirmed resolution approach.
Deferred items without a validated implementation path are the primary cause of G1 triggers.
Fix: Either add an explicit "Resolution approach confirmed: <approach>" annotation to the plan,
or move this item to the Out of Scope section with a note for the next plan.
```

## What counts as "confirmed"

A resolution approach is confirmed if the plan contains:
- A specific implementation path (e.g., "Wire via TanStack Start server function — approach validated in wiki concept X")
- A reference to an ADR or wiki decision that covers this item
- A description detailed enough for the implementer to execute without additional design decisions

A resolution approach is NOT confirmed if:
- The plan says "TBD" or "to be determined during implementation"
- The plan says "should be straightforward" without explaining how
- The plan references the item without explaining its implementation

## PIF items listed as out-of-scope

PIF items explicitly deferred to a future plan do NOT require a resolution annotation. Only items actively included in scope trigger this check.

## Empirical basis

Plan 34 (plan-d-nextjs-removal): PIF-24-2 (Chat LLM wiring) was included in scope without a confirmed implementation path for the TanStack Start server function approach. pidex-critic correctly flagged it as BLOCKING; G1 was triggered; planner deferred to v0.9.1. The G1 loop cost ~45 minutes. This check moves the catch to critique, same output with zero pipeline disruption.
