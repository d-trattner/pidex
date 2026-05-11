# Rule: Derived Display Value Assertions in V-Matrix

PROC-NEW-44b | pidex-planner

## Rule

When a plan's UI slice introduces or modifies derived display values — count badges, summary
stats, computed labels derived from a live query result or prop — the plan's V-matrix (or AC
table) must include a dedicated row:

| AC | Description | Test type |
|----|-------------|-----------|
| AC-N | [ComponentName] count badge shows N when [prop/query] returns N items | Unit/integration |

The row must specify:
1. The derived value (e.g., "count badge in SubmenuPanel header")
2. The test-controlled input (e.g., "liveItems prop with 3 items")
3. The expected output (e.g., "badge displays '3'")

"List renders correctly" does NOT cover derived counts. "All ACs verified" is not sufficient
if no AC row explicitly asserts the derived value.

## When to apply

When ALL of the following are true:
- Plan adds or modifies a UI component that displays a derived value (count, stat, label)
- The derived value is computed from a live query result, prop, or endpoint response
- The value is distinct from the raw list content (i.e., it is a transformation)

## Why this matters

Derived values computed from the wrong data source (e.g., fixture vs. live data) pass all
list-rendering assertions while displaying incorrect counts. The bug is invisible to tests
unless an assertion explicitly checks the derived value against known input data.

## Empirical basis

Plan 44 (network-items-storage, 2026-04-27): SubmenuPanel count badges computed from data.items
(fixture) instead of liveItems (prop from live endpoint). No AC row asserted badge count.
Bug discovered at G9 post-approve; required 3 targeted edits and a fix commit before push.
