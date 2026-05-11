# pidex-planner Rule — UI Intent Boundary and Existing UI Parity

## Trigger

Any plan that changes an existing visible UI surface or is classified by the orchestrator as UI intent class A/B/C/D.

## Required sections

### UI Intent Boundary

```md
## UI Intent Boundary

### Must Preserve
- ...

### May Change
- ...

### Forbidden Changes
- ...

### Source-of-Truth Screens / Files
- ...
```

For trivial UI work, a compact section is enough. For UI-heavy or existing-screen work, this section must be explicit.

### Existing UI Parity Contract

Required when the work adapts or preserves an existing screen.

```md
## Existing UI Parity Contract
| Existing behavior/layout | Keep/change? | New mapping | Evidence needed |
|---|---|---|---|
| ... | KEEP/ADAPT/CHANGE | ... | test/screenshot/user preview |
```

Include only meaningful invariants; do not turn this into a pixel-perfect checklist unless the user requested pixel parity.

### Designer Meeting / Temporary Preview Declaration

```md
## Designer Meeting / Temporary Preview
| Field | Value |
|---|---|
| UI-heavy detected | yes/no |
| User requested designer meeting | yes/no/conditional |
| Temporary preview required | yes/no/conditional |
| Preview artifact/path/URL | ... or N/A |
| Reason | ... |
```

## Forbidden planning behavior

Do not use vague phrases like "reuse visual language" as the only preservation guard when an existing screen is being changed.

If the plan says "rewrite", "redesign", or "replace" for an existing UI, explicitly state whether the old IA/layout is preserved or intentionally changed.

## Acceptance criteria

Plans with this trigger must include at least one validation/evidence row proving the preserved invariants (test, screenshot, or early preview depending on risk).
