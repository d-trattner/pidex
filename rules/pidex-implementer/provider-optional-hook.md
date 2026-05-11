# Provider-Optional Hook Pattern

**Trigger:** Any component that must render correctly both inside AND outside a React
context provider (RouterProvider, AuthProvider, ThemeProvider, etc.).

## Rule

**NEVER use a conditional hook call for provider-optional state.** Conditional hooks
violate React Rules of Hooks, trigger ESLint `react-hooks/rules-of-hooks` errors,
and are a predictable MAJ finding in code review. ESLint suppression comments on
`rules-of-hooks` are **prohibited**.

## Canonical Pattern: useSyncExternalStore with no-op fallback

When a component needs optional access to router state (or any context state), use
`useSyncExternalStore` with a fallback store that returns a safe empty value:

```tsx
import { useSyncExternalStore } from 'react'

// No-op fallback store — used when RouterProvider is not in the tree
const noopSubscribe = () => () => {}
const getServerSnapshot = () => null

function useOptionalLocation() {
  // useSyncExternalStore is legal unconditionally — no Rules-of-Hooks violation
  const routerStore = typeof window !== 'undefined'
    ? (window as any).__tanstackRouter?.stores?.location
    : undefined

  return useSyncExternalStore(
    routerStore ? (cb) => routerStore.subscribe(cb) : noopSubscribe,
    routerStore ? () => routerStore.get() : () => null,
    getServerSnapshot,
  )
}
```

The pattern generalises to any optional provider:
- RouterProvider → subscribe to `router.stores.location` or return null
- AuthProvider → subscribe to auth store or return `{ user: null, loading: false }`
- ThemeProvider → subscribe to theme store or return `'light'` as default

## Reference Implementation

`apps/web/src/components/bottom-nav.tsx` (after commit `7dbee27`, Plan 38) is the
canonical reference. The code reviewer prescribed this pattern in response to MAJ-01;
the resulting implementation is clean, lint-clean, and test-clean.

## TDD Gate Requirement

When implementing this pattern:
1. Write a test that renders the component OUTSIDE any RouterProvider
2. Verify it renders without throwing (the fallback snapshot should produce valid JSX)
3. Write a test that renders it INSIDE a RouterProvider and verifies correct state binding
4. Both tests must pass before the pattern is considered complete.

## Rationale

MAJ-01 (Plan 38) and at least one prior plan both involved conditional hook calls.
The `useSyncExternalStore` solution is non-obvious but well-documented (React 18+ core API).
Capturing it as a rule prevents it from being invented incorrectly each time a
Provider-optional component is needed.
