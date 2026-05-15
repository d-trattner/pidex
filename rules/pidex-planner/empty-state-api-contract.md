# EmptyState API Contract Binding (PROC-NEW-46-4)

**Applies to:** pidex-planner, pidex-implementer
**Load when:** writing a plan that introduces a new use of the `<EmptyState>` component, OR any plan that adds a new page/tab/sub-tab that will be in an empty state before data loads.

---

## The Contract (binding, not advisory)

The `<EmptyState>` component in `apps/web/src/components/ui/atoms/empty-state.tsx` accepts:

| Prop | Type | Correct usage | WRONG usage |
|------|------|---------------|-------------|
| `icon` | `LucideIcon` (component reference) | `icon={Bot}` | `icon={<Bot />}` |
| `message` | `string` | `message="No agents configured"` | `label="No agents configured"` |
| `detail` | `string \| undefined` | `detail="Optional context"` | — |
| `action` | `ReactNode \| undefined` | `action={<Button>...</Button>}` | — |

**The `icon` prop takes a component reference (the icon constructor), NOT a JSX element (an already-rendered element).** Passing `<Bot />` instead of `Bot` causes a runtime render crash.

**The message prop is named `message`, not `label`, not `text`, not `description`.**

## Required plan annotation

Any plan that introduces a new `<EmptyState>` usage MUST include in the Implementation Notes or Slice description:

```
EmptyState usage: icon={Bot} (component ref, NOT <Bot />), message="..." (not label=)
```

This note is a binding instruction to the implementer — not documentation.

## Required implementer check

Before committing any slice that adds an `<EmptyState>`:

1. Confirm `icon=` receives a component reference (no angle brackets, no JSX).
2. Confirm the message prop is spelled `message=`.
3. Confirm the component is imported from `~/components/ui/atoms` barrel.

This is a 30-second grep check: `grep -n "EmptyState" <file>` and visually confirm.

## Why this rule exists

Plans 25, 38, and 46 all had G9 render crashes caused by the same EmptyState prop mismatch:

| Plan | Error | Fix |
|------|-------|-----|
| 25 | `icon={<Search />}` instead of `icon={Search}` | One-pass fix, second G9 approved |
| 38 | `label=` prop instead of `message=` | One-pass fix, second G9 approved |
| 46 | `icon={<Bot />}` + `label=` both wrong | One-pass fix, second G9 approved |

The fix is always fast (< 5 lines). But each occurrence requires: implementer re-spawn, code-review re-check, G9 retry. The pattern is identical each time — it is not discovered by any automated test in the pipeline because the error only manifests when the component renders in a live browser.

Adding this check to the plan body breaks the recurrence: the implementer has the correct API surface in front of them when writing the code.

## Reference

`wiki/concepts/interaction-state-atoms.md` — full EmptyState component spec including prop types, DESIGN.md §8 binding, and SSR safety rules.
