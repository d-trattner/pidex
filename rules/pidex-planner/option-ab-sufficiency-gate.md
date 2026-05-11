# Rule: Option A/B Sufficiency Gate

PROC-NEW-45a | pidex-planner

## Rule

When a plan revision defers Option B with language such as "Option A is sufficient,"
"Option B is cleanup," or "Option B deferred to future plan," the planner MUST add
an **Option A Sufficiency Check** section to the plan:

| Condition required for Option A | Verified? | How verified |
|----------------------------------|-----------|--------------|
| <runtime condition Option A assumes> | YES/NO | <grep result / code inspection / endpoint response> |

If any required condition is NOT verified as true, Option B is required and must enter scope.

## Trigger

Any plan revision produced in response to a design-gate REJECTED verdict, where:
- The design review named two or more options (A, B, ...)
- The revision selects Option A and marks Option B as deferred/cleanup/future

## Sufficiency check method

For each condition in the table:
1. If it depends on a runtime data source (endpoint, fixture, query): grep the
   implementation file for the data source and confirm it returns live data, not fixture.
2. If it depends on a component prop path: trace the prop from query result to render.
3. If it depends on a cache key: confirm the key is the canonical query key for
   the component that will be affected.

## Anti-pattern

Sufficiency declared by reasoning alone ("Option A invalidates both cache keys,
so the Agents tab will refresh") without verifying the data source the refreshed
query returns.

## Empirical basis

Plan 45 (audit-to-issue-pipeline, 2026-04-27): Design review produced Option A
(dual-invalidate ["network"] + ["network","items"]) and Option B (re-wire Agents
sub-tab to liveItems). Option B deferred as cleanup. Option A was implemented per
plan — but the /api/v2/network endpoint returns fixture data.items, so refetching
["network"] returned the same fixture, not live agent items. G9 required a 2-edit
fix (liveAgents memo + liveItems filter) which was architecturally Option B. A
one-line grep of /api/v2/network.ts at plan revision time would have revealed
the fixture source.
