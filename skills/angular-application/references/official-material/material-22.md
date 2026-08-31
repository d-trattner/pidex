# Official Angular Material 22 reference map

Baseline packages: `@angular/material@22.1.4` and `@angular/cdk@22.1.4` (MIT), aligned with Angular 22.1.4.

Use current official documentation as authority:

- Setup and schematics: https://material.angular.dev/guide/getting-started
- Material 3 theming: https://material.angular.dev/guide/theming
- Theming custom components: https://material.angular.dev/guide/theming-your-components
- Typography: https://material.angular.dev/guide/typography
- Component catalog: https://material.angular.dev/components/categories
- CDK catalog: https://material.angular.dev/cdk/categories

Version-22-relevant invariants captured from the official guides:

- `ng add @angular/material` installs Material/CDK and modifies dependencies/global setup; it is a source-changing dependency action requiring explicit authority.
- The v19+ Sass `mat.theme` API emits Material Design token CSS variables for color, typography and density.
- Material 3 themes and token APIs are preferred; Material 2 themes are compatibility paths.
- Light/dark behavior uses explicit `color-scheme`; test actual theme modes and contrast.
- Density below zero can reduce accessibility.
- Use documented theme/component override mixins, not private DOM/classes.
- Strong focus indicators are available and should be considered for WCAG-visible focus.
- Component-specific Accessibility and Styling documentation plus Material/CDK harnesses are required references for affected components.

This file is a PIDEX reference map, not a copied substitute for component API documentation. Inspect the installed package version and use matching official docs for exact APIs.
