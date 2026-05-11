# Deferred Capability Evidence Snippet

PROC-NEW: 80-2

## Rule
When implementation defers capability or keeps item out-of-scope, impl evidence must include fixed snippet.

## Fixed snippet (required)
`Deferred/Out-of-Scope: capability not implemented in this slice by approved scope. No hidden partial behavior shipped. Follow-up tracked in plan/open-items.`

## Enforcement
Snippet missing when defer/out-of-scope claimed => handoff incomplete. Add snippet before final ROUTING.
