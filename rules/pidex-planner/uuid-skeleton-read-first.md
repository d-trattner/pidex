# UUID Read-First on Skeleton Pre-Creation (PROC-NEW-39b)

**Applies to:** Orchestrator pre-creating output skeletons (Rule 9b)
**Load when:** about to pre-create any output doc skeleton for a downstream agent.

---

Before writing ANY pre-created output skeleton, the orchestrator MUST:

1. Read the plan doc frontmatter (`agents.output/planning/<id>-<slug>.md` or its `closed/` path)
2. Extract the `UUID` field from the frontmatter
3. Use that UUID — verbatim — in the skeleton's frontmatter

**Never generate a fresh UUID for an inheriting doc.** Generating a new UUID violates Rule 2 and breaks the ID traceability chain across all pipeline docs for that plan.

## Correct workflow

```
1. Read plan frontmatter → get UUID (e.g., a8f3d2c1)
2. Write skeleton:
   ---
   ID: 39
   Origin: 39
   UUID: a8f3d2c1   ← copied from plan, NOT generated
   Status: Active
   ---
```

## Wrong (creates UUID mismatch)

```
Write skeleton with UUID: b7f2d38a  ← newly generated, wrong
```

## Impact of violation

- Traceability break: plan UUID ≠ downstream doc UUIDs
- Rule 2 invariant violated: "ID, Origin, UUID must match across all docs for same plan"
- No runtime failure, but audit and closure sweeps may misidentify orphan docs

## Applies to all skeleton types

retro, PI, code-review, qa, uat, security, implementation, design-review — every skeleton pre-created via Rule 9b must follow this workflow.
