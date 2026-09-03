# Angular Material profile

Activate only when Material/CDK is installed or explicitly selected.

- Keep `@angular/material`, `@angular/cdk`, and Angular majors aligned.
- Add dependencies through the exact workspace-local Angular CLI only with explicit dependency authority.
- Prefer Material 3 and the current Sass `mat.theme` API.
- Define color, typography and density deliberately; density reductions require accessibility review.
- Use design-token variables and documented `overrides` mixins. Never depend on private component DOM/classes.
- Support light/dark mode through explicit `color-scheme` behavior and test contrast in both modes.
- Enable strong focus indicators and preserve keyboard/ARIA behavior.
- Prefer Material/CDK component harnesses over brittle DOM selectors.
- Use Angular Aria/CDK primitives when a Material component does not fit, but do not combine overlapping interaction ownership accidentally.
- Put reusable theme/tokens/composition in a design-system boundary; keep product-domain behavior outside it.

## Preserve task completion while applying the profile

Before adding Material-specific completion work, keep a checklist of every user-visible behavior and test journey explicitly required by the task. Material 3 theming, focus treatment, and harness adoption are additive checks: they must not replace, weaken, or omit any required interaction, mode transition, state, or focused test.

Before reporting completion, verify both layers:

1. every task-required journey still has focused passing evidence, including each requested interaction and mode transition;
2. appearance modes use the current Material 3 Sass `mat.theme` API with explicit `color-scheme`, and Material-owned interactions are tested through Material/CDK component harnesses with `TestbedHarnessEnvironment` rather than generic or private DOM interaction.

Preserve the workspace's existing change-detection strategy; do not add `ChangeDetectionStrategy.OnPush` solely because signals or Material are used.

Final completion gate — do not report complete until all are true:

- every requested interaction, state, retry, and appearance-mode journey retains focused passing evidence;
- each appearance mode uses Material 3 `mat.theme` with explicit `color-scheme`;
- tests use `TestbedHarnessEnvironment` and Material/CDK component harnesses for Material-owned interactions;
- build/tests and browser, keyboard, responsive, and AXE checks pass for affected UI journeys.
