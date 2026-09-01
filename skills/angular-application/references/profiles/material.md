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

Completion requires build/tests plus browser, keyboard, responsive and AXE evidence for affected UI journeys.
