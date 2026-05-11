# Rule: waitFor Re-Query Constraint in Timing-Fix Plans

**PROC-NEW:** 43a  
**Applies to:** pidex-planner  
**Trigger:** Plan objective includes wrapping assertions in `waitFor` to fix a timing flake or async assertion race

## Rule

When a plan's scope is a timing/flake fix that uses `waitFor`, the plan body MUST include this constraint as an explicit named note (not merely illustrative):

> "CRITICAL: DOM element references used in `waitFor` assertions MUST be queried inside the `waitFor` callback (using synchronous `getByRole`/`getBy*` queries). Never capture the element reference outside the callback and close over it. Closing over a pre-captured reference makes `waitFor` retry against a stale DOM node — the retry will read old DOM state rather than re-rendered state, and the race condition will not be fixed."

## Placement

Add this note immediately after the "Pattern to mirror" or "Implementation approach" section that introduces `waitFor` usage. If no such section exists, add it as a standalone "waitFor Constraint" note before the Scope table.

## Correct Pattern (include in plan)

```typescript
// CORRECT — re-query inside waitFor; each retry sees fresh DOM
await waitFor(() => {
  const btn = screen.getByRole("button", { name: /Running/ });
  expect((btn as HTMLButtonElement).disabled).toBe(true);
});

// WRONG — stale reference; waitFor retries against old DOM node
const btn = await screen.findByRole("button", { name: /Running/ });
await waitFor(() => {
  expect((btn as HTMLButtonElement).disabled).toBe(true);
});
```

## Rationale

Plan 43 (2026-04-27): The implementer correctly wrapped assertions in `waitFor` but captured the element reference outside the callback. Isolated test runs passed. Under full-suite parallel CPU load (50% flake rate), the stale reference was exposed. A second implementation revision was required. The plan's illustrative pattern showed the correct form but did not name the anti-pattern or state the constraint as a rule, leaving the implementer's interpretation reasonable but incorrect.

## Scope

Applies to any plan that:
- Has "fix timing flake" or "fix flaky test" as its primary objective
- Prescribes `waitFor` as the fix mechanism
- Involves DOM assertions after async user events (`userEvent.click`, etc.)

Does NOT apply to plans that add `waitFor` usage to new tests (where no existing flake is being fixed).
