# Rule: UI-Heavy Profile + Designer Preflight

PROC-NEW-UI-HEAVY-PREFLIGHT | pidex-planner

## Rule

Before handing any UI-heavy plan to `pidex-critic`, planner must self-check execution profile and designer routing.

A plan is UI-heavy when it changes any of:

- mobile/responsive layout;
- global navigation/header/project selector;
- multi-view dashboard UX;
- chart/table/card hierarchy;
- token/pagination controls;
- G9/user-preview-sensitive UI.

For UI-heavy plans:

1. `Execution Profile` must use a supported enum value, normally `ui-heavy`.
2. Planner must not use composite/unsupported profiles such as `ui-heavy + api-security`.
3. `pidex-designer` must be `do not skip` unless the plan narrows scope to `ui-small` with explicit critic-approved skip safety.
4. If API/security surfaces are also touched, keep `pidex-security: do not skip` in skipped-agent table; do not encode security by inventing a composite profile.
5. Plan lint table must include:

```text
UI-heavy profile/designer preflight: PASS
- profile enum: ui-heavy
- designer: do not skip
- security retained when API/data touched: yes/no
```

## Blocker

If any check fails, planner must revise before critic handoff. Do not rely on critic to catch obvious profile/designer mismatch.

## Why

Plan 4 dashboard parity initially used unsupported composite profile and skipped designer for a UI-heavy mobile/global selector change. Critic caught it, but that added an avoidable G1 loop. Planner can deterministically reject this before handoff.
