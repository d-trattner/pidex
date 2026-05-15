# Capability-Limited Empty State: TODO Comment Required

**PROC-NEW-41d** | Added: 2026-04-26 | Plan 41 evidence

## Rule

When implementing an informative empty state or disabled feature that exists because the **current API or adapter does not yet support the required data** (not because the feature is permanently out of scope), add a TODO comment at the render decision point:

```tsx
// TODO: when UniFi adapter gains upgradeAvailable field, render non-empty UpdatesView here
// See: wiki/open-items.md CR41-L2
{items.length === 0 && <EmptyState message="No firmware updates available from current adapter" />}
```

## What triggers this rule

The plan or OQ resolution explicitly states one of:
- "API does not currently expose X"
- "adapter capability does not include X"
- "deferred pending upstream API support"
- "informative empty state while X is unavailable"

## What does NOT trigger this rule

- Intentional permanent empty states (e.g., first-run state, genuinely no data)
- Features explicitly deferred to a future plan (those get an open-items entry instead)
- Error states (those get proper error handling, not a TODO)

## Comment format

```tsx
// TODO(<plan-id>): when <condition>, add <behavior> here
// Tracked: wiki/open-items.md <finding-id>
```

The `<finding-id>` reference enables future planners to locate the tracking entry and close the TODO when the capability arrives.

## Why

Without a code-level TODO, the empty state appears to be a permanent design choice. Future implementers who add the capability to the API adapter will not know to look for the render path that needs to be updated. The TODO creates a traceable signal from code to the open-items tracker.
