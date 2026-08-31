# Small and medium Angular optimization

## S

Keep the change local. Prefer one focused component/service/form boundary, existing project conventions, strict types, signals for local state, and the smallest proving test. Do not introduce a state library, design system, shared library, SSR, or Nx restructuring for a local task.

## M

Organize by feature ownership. Lazy-load feature routes where useful, separate UI/data access when it improves locality, model loading/error/empty states, and test route/form/accessibility behavior. Reuse project design-system components before creating abstractions.

When Material is selected, establish one deliberate Material 3 theme and documented token usage rather than ad-hoc component overrides.
