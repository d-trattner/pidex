# API-Route + UI Plan: 2–3 Slice Spawn Cap (PROC-NEW-46-1)

**Applies to:** pidex-planner
**Load when:** writing a plan that combines a new API route with UI changes (new page, new tab, or new sub-tab) in the same plan.

---

## Rule

For plans that combine **a new API route AND UI changes** (any plan whose slice table contains both a backend route slice and a frontend component/page slice), the spawn boundary MUST be placed after the 2nd or 3rd slice — not after the 4th or 5th.

**Hard cap: max 3 slices per spawn for API-route + UI plans.**

Plans 40, 45, and 46 data shows that 4-slice spawns for this plan shape stall at ~40 tool_uses. The domain depth (route scaffolding → schema → handler → test → UI component → page wiring → RTL tests) is consistently underestimated at planning time.

## Required spawn boundary placement

When any plan has:
- An API route slice (new route file, handler, schema, zod validation, MSW handler)
- A UI slice (new page, new tab entry, new sub-tab, new EmptyState/loadingSkeleton usage)
- 3+ total implementation slices

Split at or before slice 3. Example:

```
⟪Spawn A: Slices S0–S2⟫
S0: Scaffold (route file, handler shell, zod schema, unit tests RED)
S1: Handler implementation (tests GREEN, integration)
S2: API integration + domain hook
⟪Spawn B: Slices S3–S4⟫
S3: UI component + page wiring + RTL tests
S4: Version bump + CHANGELOG
```

Do NOT place all 4+ slices in Spawn A for this plan shape.

## Spawn budget estimates (include in plan)

Include estimated tool_use ranges per spawn in the "Spawn plan" section:

```
**Spawn plan (PROC-7)**:
- ⟪Spawn A: Slices S0–S2⟫ — API route + backend, ~25–40 tool-calls
- ⟪Spawn B: Slices S3–S4⟫ — UI + version bump, ~20–35 tool-calls
```

For plans with both a Spawn B (UI) and Spawn C (version bump), annotate all three boundaries.

## Relationship to `pre-spawn-implementer-split.md`

This rule is a **specialization** of the general `pre-spawn-implementer-split.md` pattern. The general trigger (`3+ slices → annotate boundaries`) already applies. This rule adds the explicit cap of **2–3 slices per spawn** for the API-route + UI plan shape, and overrides the "3+ slices = consider split" guidance for this domain by making it mandatory.

## Empirical basis

- Plan 40 (audit-run route + UI): Spawn A S0–S2, no stall. Clean separation.
- Plan 45 (audit persistence + UI): Spawn A stall at S2/S3 boundary (~38 tool_uses).
- Plan 46 (analyze route + Agents tab): Spawn A stalled twice at S1/S2 and S2/S3 boundaries (~40 tool_uses). The 28-tool-call estimate in the plan was optimistic by ~40%.

After Plan 46, this rule is elevated from guidance to mandatory for API-route + UI plans.
