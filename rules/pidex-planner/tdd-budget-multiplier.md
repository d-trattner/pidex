# TDD-Heavy Adapter Plan: Budget Multiplier (PROC-NEW-51-1)

**Applies to:** pidex-planner
**Load when:** writing a plan whose implementation slice includes ≥8 new tests in a single spawn.

---

## Rule

When a plan specifies **≥8 new tests** for a single adapter file or module in one spawn, the budget
estimate MUST use the following formula instead of a flat complexity-based estimate:

```
budget = (test_count × 2.5) + implementation_overhead + version_overhead
```

**Calibration values:**
- `test_count`: number of new `it()` / `test()` blocks in the plan's test scope
- `implementation_overhead`: 8–12 for a single-file adapter change (read existing file, write impl,
  run confirm, architecture comment handling)
- `version_overhead`: 3 for plans including a version bump + CHANGELOG entry; 0 if no version change

**Why 2.5 per test:** Each RED → GREEN cycle involves: read test file (1), write/edit impl (1),
confirm GREEN (0.5–1). REFACTOR adds ~0.5 per test for complex logic. Average = ~2.5 tool-uses per
test regardless of implementation complexity.

## Example

Plan with 11 tests, single-file adapter, version bump:
```
(11 × 2.5) + 10 + 3 = 40.5 → report as "~40 tool-calls"
```

A flat estimate of "15 tool-calls" for the same plan would be 2.6× off.

## Relationship to api-route-ui-spawn-cap.md

That rule provides spawn cap guidance for API+UI plans (25–40 for backend, 20–35 for UI).
This rule is the **equivalent for TDD-heavy single-file adapter plans** with no UI surface.
The two rules may co-apply if a plan has both a UI slice and a high test-count adapter slice.

## Empirical basis

- Plan 51 (pihole-fanout-writes, 2026-04-29): 11 tests, estimated 15 tool-calls, actual 39. Formula
  gives 40.5 — nearly correct.
- Plan 46 (analyze-route+Agents-tab): backend spawn estimated 28 tool-calls, actual ~40 (42% off).
  API+UI plan shape; covered by PROC-NEW-46-1. Test count was ~8.
