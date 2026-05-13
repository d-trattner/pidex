# Bounded Fix Slice Plan

PROC-NEW-88-2 | pidex-implementer

## Trigger
Implementation work where multiple defects/fixes can expand into mixed-cause edit loops (runtime-contract + validation + hardening + regressions).

## Rule
Each implementer spawn must be split into bounded fix slices with an explicit resume chain.
For every spawn-ready slice, include:

1. `Objective` — one atomic behavior/defect.
2. `Failure class` — what class of break this slice addresses.
3. `Scope boundaries` — one domain/failure surface only (fixture/action/API slice, or a bounded related subgroup).
4. `Pass criteria` — concrete evidence required to close slice.
5. `Next-slice trigger` — condition that hands off to next slice.
6. `Contract lock` — list of required payload fields and security assertions that must be validated before fixture/action edits.

No slice may include more than one primary failure class.
No slice may touch fixtures/actions before `contract lock` checks pass.

## Example

**Before**

```md
- Fix migration, contract drift, malformed payloads, and flake handling in one pass.
```

**After**

```md
## Slice 1 — Migration Baseline
- Objective: align migration outputs with new response schema.
- Failure class: response-shape drift.
- Scope: `src/network/router.ts`, `src/network/adapter.ts`.
- Pass criteria: schema fixture validates; one known payload test passes.
- Next-slice trigger: response fixture stable with zero schema mismatches.

## Slice 2 — Runtime-Contract Repair
- Objective: repair approve/plan/execution contract flow.
- Failure class: action-handler contract mismatch.
- Scope: `src/network/engine.ts`.
- Pass criteria: action command tests pass with required fields; no regressions in `/approve` path.
- Next-slice trigger: action fields validated for all four contract states.

## Slice 3 — Malformed-Data Hardening
- Objective: reject malformed inputs deterministically.
- Failure class: input-validation resilience.
- Scope: `src/network/validator.ts`.
- Pass criteria: malformed corpus returns explicit `400` + typed errors.
- Next-slice trigger: malformed suite has zero open failures.

## Slice 4 — Regression Assertions
- Objective: lock in migration safety.
- Failure class: regression/perf side-effect.
- Scope: `tests/network/*.spec.ts`.
- Pass criteria: full regression assertions green and green evidence attached.
- Next-slice trigger: all slice pass criteria satisfied; handoff to QA.
```

## Acceptance checks

- Each spawn has named slices with exactly one dominant failure class.
- Slice objectives are mutually disjoint and ordered.
- Scope boundaries enforce one-domain / one-failure-class edits.
- Pass criteria include measurable command/output evidence.
- Contract lock evidence (required DTO fields + auth expectation checks) exists before any fixture/action mutation.
- Next-slice trigger is explicit and verifiable.
- No unbounded “fix everything in one pass” instructions.

## Fail criteria
- Single spawn contains multiple unrelated failure classes.
- Missing next-slice trigger.
- No pass criteria evidence.
- Slice boundaries not disjoint.
