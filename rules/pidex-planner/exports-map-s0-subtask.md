# Rule: package.json Exports Map Update as Explicit S0 Sub-task (PROC-NEW-42b)

## Trigger

A plan introduces a new module under a package that has an explicit `exports` map — most commonly `packages/core/package.json` in this project.

## Rule

When a plan adds a new source file under `packages/core/src/<domain>/`, the plan's S0 slice **must** include the following as a named sub-task:

> Verify and update `packages/core/package.json` `exports` map to include `"./<domain>": "./dist/<domain>/index.js"` (or the appropriate path).

This sub-task is **not a risk entry**, not a note, and not a "the implementer will check." It is a first-class S0 action item with its own commit.

## Rationale

Plan 42 had a Risks entry (R-1) for the missing `./network` exports entry in `packages/core/package.json`. The critic correctly identified this as a Medium finding (M-1) and promoted it to an explicit S0 task. The promotion worked — the implementer bundled it into commit `4db16a7` — but it required a critic gate to catch a build-time failure that was fully predictable from the plan scope.

Missing exports map entries are the most common class of "build succeeds in test, fails at import time" errors when adding new modules under a package with a strict exports map. Promoting them to S0 sub-tasks at planning time eliminates the critic's M-finding and the associated back-and-forth.

## How to apply

1. When writing a plan that creates `packages/core/src/<new-domain>/`, check whether `packages/core/package.json` has an `exports` field.
2. If it does, add to the S0 slice sub-tasks:
   ```
   - [ ] Add `".<new-domain>"` entry to `packages/core/package.json` `exports` map
   ```
3. Add the `packages/core/package.json` row to the plan's Files in Scope table.
4. Do NOT list this as a risk or a note — it is a deterministic pre-condition, not a contingency.

## Scope note

This rule applies to any package in the project that uses an explicit `exports` map (not `"exports": "."`). It is most commonly triggered by `packages/core` but applies equally to other workspace packages with the same pattern.

## Validation

The next plan introducing a new `packages/core/src/<domain>/` module should include the exports update as a named S0 sub-task without requiring a critic M-finding.

## Origin

PROC-NEW-42b — Plan 42 (network-audit-persistence), critic M-1 finding for missing `./network` exports entry.
