# Fixed Chrome Geometry Audit

**Trigger:** Any plan that introduces a new `position: fixed` or `position: sticky` element
at a breakpoint (mobile, tablet, or desktop).

## Required: Fixed Chrome Geometry Table

When this trigger fires, the design review MUST include a "Fixed Chrome Geometry" section
containing a table of ALL fixed/sticky elements active in the affected breakpoint range:

| Element | CSS file | `bottom` | `top` | `left` | `right` | `z-index` | Breakpoint activation |
|---------|----------|----------|-------|--------|---------|-----------|----------------------|
| (new element) | ... | ... | ... | ... | ... | ... | ... |
| (existing element A) | ... | ... | ... | ... | ... | ... | ... |

## Conflict Detection

After filling the table, check:

1. **Same-anchor conflict:** Two elements share the same anchor value (e.g., both `bottom: 0`)
   with overlapping breakpoint activation ranges — MEDIUM finding required.
2. **Geometric overlap:** Two elements whose size + anchor would cause pixel-level overlap
   at any viewport width in the shared activation range — MEDIUM finding required.
3. **z-index dominance without separation:** Two elements at the same anchor without explicit
   z-index difference AND without one shifting the other via margin/padding — flag as MEDIUM.

## MEDIUM Finding Format

```
MEDIUM — Fixed Chrome Geometry Conflict
Elements: <element A> and <element B>
Conflict: both at bottom: 0 in viewport range ≤Npx
Required resolution: plan must specify geometric resolution
  (e.g., element B overrides bottom to calc(Npx + safe-area-inset-bottom))
```

## Rationale

This class of bug — "overlay covers fixed nav because both anchor to bottom: 0" — is
entirely CSS-inspectable at design time but invisible to jsdom (which does not resolve
`@media` queries or `env()` in `getBoundingClientRect`). It cannot be caught by automated
tests. It requires a G9 rejection + hotfix cycle if missed. The check is mechanical and
takes ~2 minutes. Plans 17, 31, and 38 all encountered this class of conflict.
