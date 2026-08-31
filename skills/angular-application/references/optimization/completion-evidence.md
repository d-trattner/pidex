# Angular completion evidence

Report only gates that actually ran.

Minimum evidence is proportional:

- S: reproducing/focused test plus build or template/type check.
- M: focused tests, build, relevant route/form/browser journey and AXE for UI.
- L: affected domains/libraries, integration/rendering checks, build and broader regression.
- XL Nx: project/graph identity, focused target, affected selection, full required targets, boundary checks, preview/browser/AXE and cleanup.

For Material UI include keyboard focus, contrast, responsive layout, theme modes where supported, and harness-backed component behavior.

Record command/target identity, status, duration, bounded diagnostics, skipped/unsupported gates and remaining uncertainty. Never invent coverage. If coverage is not configured, report `NOT_CONFIGURED`.

Compilation is not proof of product behavior, accessibility, architecture fitness, process cleanup, or persistent follow-up-change safety.
