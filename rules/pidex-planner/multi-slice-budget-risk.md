# Multi-Slice Budget Risk (MANDATORY for plans >4 slices)

pidex-implementer has bounded turn budget (maxTurns × ~1.75 tool-calls ≈ 40-70 tool-calls per spawn). Too many slices exhausts budget before implementer can commit + finalize work.

**Threshold:** plan exceeds **4 slices** OR estimated **>30 tool-calls** for implementation → add explicit "Multi-Slice Budget Risk" section with ONE resolution:

**Option A — Split into sub-plans** (preferred):
Break into two sequential plans (e.g., `B.1.a.i` + `B.1.a.ii`). Each gets own pidex-implementer spawn. Each fits single turn budget. Clean commit history, clean pipeline gates per sub-plan.

**Option B — Pre-declare two back-to-back implementer sessions**:
One plan, Process section says: "pidex-implementer session 1 handles Slices 0-N (budget target ~25 calls). Session 2 handles Slices N+1 onwards (budget target ~25 calls). Orchestrator spawns session 2 after session 1 commits + emits ROUTING." Requires orchestrator cooperation; harder to reason about.

**Option C — Accept the risk**:
If implementer can genuinely do it in one turn, document why with tool-call estimate per slice. Accept that if budget exhausted, orchestrator must finish manually (committed work + impl-doc finalization).

**pidex-critic MUST flag** plans exceeding 4-slice / 30-call threshold without this section. Plan without stated budget strategy is implicitly Option C — must be conscious choice.

**PROC-7 Spawn-Split Annotation (MANDATORY when Risk table contains PROC-7 row OR slice count is 4+)**:

When plan's Risk table includes PROC-7 row (multi-slice budget risk), OR slice count is 4+, planner MUST add explicit spawn-split markers to slice table. No longer "implementer judgment" — annotation is plan's contract with orchestrator.

**Required format** — add `Spawn` column to slice table:

| Slice | Description | Spawn |
|-------|-------------|-------|
| 0 | Scaffold / setup | A |
| 1 | Tracer bullet (core path) | A |
| 2 | Feature behaviors | A |
| 3 | Rollout to existing surfaces | B |
| 4 | Version bump + CHANGELOG | B |

And add section below slice table:

```
**Spawn plan (PROC-7)**:
- ⟪Spawn A: Slices 0-2⟫ — architectural + core work, ~25 tool-calls
- ⟪Spawn B: Slices 3-4⟫ — mechanical rollout + release prep, ~15 tool-calls
The orchestrator pre-plans two pidex-implementer spawns based on these markers.
```

**Why mandatory:** Plans 22 and 23 both had spawn-split annotations; both ran without orchestrator intervention at implementer boundary. Plans 16-18 lacked them; all three required orchestrator-direct commits (Rule 10d anti-pattern). Three successful cycles confirm annotation is correct default, not optional addition.

**Anti-pattern** (Plan 17 B.1.a, 2026-04-21): 6 slices, no budget-risk section, implementer hit 70 tool_uses (> its 40 `maxTurns × 1.75` = ~70 ceiling), all 6 slices' code landed on disk but nothing committed. Orchestrator had to commit in 4 batches post-hoc. Could have been prevented by Option A (split into 17.a + 17.b) or Option B (two-session spawn).
