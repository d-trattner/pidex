# Rule: Block Comment Route-Path Hazard

PROC-NEW-40a | pidex-implementer

## Rule

**In TypeScript and JavaScript files, use `//` line comments — NOT `/* */` block comments — for
inline documentation, especially when describing route paths, URLs, or API endpoints.**

## Why this matters

The `*/` token terminates a block comment in JavaScript/TypeScript. Any comment containing
a route path like `*/api/v2/network`, `*/users/:id`, or `*/health` will close the block comment
early. The code after the `*/` becomes bare syntax, and esbuild/tsc emits a confusing parse error
pointing at the identifier following the closed comment — not at the comment itself.

Example of the hazard:

```typescript
// WRONG — the comment closes at "*/", leaving "api/v2/network" as a syntax error
/* GET */api/v2/network — list devices */

// CORRECT — line comments are always safe
// GET /api/v2/network — list devices
```

The error message from esbuild is non-obvious:
  `Expected ';' but found 'network' at line N:M`

This error does not point to the comment and is difficult to diagnose, especially when the
comment was written without awareness of the hazard.

## Scope

This rule applies to:
- TanStack Start route files (`.tsx` files under `app/routes/`)
- Any TypeScript or JavaScript file where comments describe URLs or route paths
- JSDoc block comments are exempt when they do not contain `*/` substrings

## Self-check

Before submitting a slice for commit, scan all new/modified `.ts`, `.tsx`, `.js` files for
block comments (`/* ... */`) containing `/` after `*`:

  grep -n '/\*.*\*/' <file>

If any match contains a route path or URL pattern, convert to `//` line comments.

## Empirical basis

Plan 40 (network-live-data-wiring, 2026-04-26): pidex-implementer wrote a block comment describing
a `/api/v2/network` route path. The `*/` substring closed the comment early. esbuild parse
error caused a debugging loop that exhausted the agent's turn budget. Orchestrator diagnosed
and fixed directly (Rule 10 violation). The fix was converting one block comment to line
comments.
