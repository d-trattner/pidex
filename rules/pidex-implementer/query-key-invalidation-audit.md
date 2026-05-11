# Rule: New Query Key → Invalidation Audit

PROC-NEW-48-2 | pidex-implementer

## Rule

After each spawn, for every new `useQuery` key introduced in that spawn:

1. Identify every mutation callback (`onSuccess`, `onSettled`) in the codebase that modifies
   the same underlying data source.
2. Verify that each such callback calls `queryClient.invalidateQueries({ queryKey: THE_KEY })`.
3. If a mutation modifies MULTIPLE data sources (e.g., appends to both an items list and an
   activity log), verify that BOTH keys are invalidated — typically in a `Promise.all([...])`.

Document this check in the TDD table or as an "Invalidation coverage" note in the slice entry
for the slice where the new query key was introduced.

## Self-check trigger

Before writing the impl doc entry for any slice that contains a new `useQuery` or `queryKey`
constant:

```
New query keys this slice: [list them]
For each key:
  Data source: [file/storage class]
  Mutations that write to that source: [list mutation callbacks by file/function]
  Each mutation invalidates this key: [YES / NO — fix before handoff if NO]
```

## What this prevents

A new query key that is never invalidated means the UI shows stale data after a mutation
succeeds. This is a silent correctness failure: tests for the mutation may pass (server returns
200), but component tests that render the updated list will show the old data.

## Scope

- Applies to any slice that introduces a new `queryKey` constant or a new `useQuery(KEY, ...)` call.
- Does NOT apply to query key refactors that only rename an existing key (no new data source).

## Exemptions

- Query keys for read-only data sources that have no mutation path (e.g. static config endpoints).
  Mark explicitly: "No mutation path — invalidation not applicable."

## Empirical basis

Plan 48 (network-auto-analysis-pipeline, 2026-04-28): `ACTIVITY_QUERY_KEY` introduced in
Spawn B but not invalidated by the create or approve mutations. AC-4 was a code-review
BLOCKING finding (finding `9998537`). The same class of error appeared in at least two prior
plans. The pattern is predictable because LLM-trigger routes often write to a secondary storage
(activity log) that the implementer adds but forgets to wire into the mutation's onSuccess.
