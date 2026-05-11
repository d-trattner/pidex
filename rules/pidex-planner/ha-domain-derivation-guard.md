# Rule: HA Domain Derivation Guard

**PROC-NEW:** 47-3
**Applies to:** pidex-planner (plan authoring), pidex-critic (review check)
**Added:** 2026-04-28

## Rule

Every plan that touches HA entity counting, filtering, or grouping by domain **must include**:

1. An explicit assumption in `§Assumptions` stating that domain is derived as `entity_id.split(".")[0]` (not read from a `.domain` field — `HAEntity` has no `.domain` field).
2. A V-matrix row that tests the domain-derivation path with a near-match entity_id to guard against off-by-one string prefix bugs.

## Required V-matrix Row

The row must test that a near-match prefix does **not** count as the target domain:

```
| <N> | Domain derivation guard | entity_id="automatic_door.x" → NOT counted as domain "automation" | PASS |
```

Adapt the entity_id and domain strings to the specific domain being tested, but the anti-pattern to guard against is always: an entity_id whose prefix is a superstring of the target domain (e.g., `"automation_room.light"` must not match `"automation"`).

## Scope

This rule applies to any plan that:
- Counts entities by domain (automation count, update count, media_player count, etc.)
- Filters entities where `entity_id.split(".")[0] === "<domain>"`
- Groups entities into domain buckets

If the plan only reads entity state or attributes without domain-based filtering, this rule does not apply.

## Planner Checklist

When writing a plan that filters HA entities by domain:
- [ ] `§Assumptions` contains: "Domain derived as `entity_id.split('.')[0]`; `HAEntity` has no `.domain` field."
- [ ] V-matrix contains a near-match domain derivation guard row.
- [ ] Implementation slice names the derivation expression explicitly (not left implicit).

## pidex-critic Check

Flag as MEDIUM if a plan filters HA entities by domain but:
- Does not state the derivation method in `§Assumptions`, OR
- Does not include a near-match guard row in the V-matrix.

Flag as CRITICAL if the plan body uses `entity.domain` as a field access (TypeScript error at runtime).

## Rationale

Validated in Plan 47: pidex-critic M-1 caught that `HAEntity` has no `.domain` field. The implementer added test 16 (`"automatic_door.x"` must NOT count as `"automation"`) as a regression guard. Without this guard, an entity_id like `"automation_room.light"` would be misclassified as `"automation"` if the filter logic used `startsWith` instead of a split. The V-matrix row makes this class of bug immediately visible in CI.

**Source:** `packages/core/src/services/ha.ts` — `HAEntity` type. The HA convention is `entity_id = "domain.object_id"` (always exactly one dot separating domain from object_id, but object_id may itself contain dots). The correct derivation is `entity_id.split(".")[0]`.
