# Rule: Epic Interview Readiness Status

**Applies to:** pidex-roadmap, orchestrator next-work selection

## Canonical roadmap status

Use `Interview` when an epic is valuable enough to keep on the roadmap but not yet crisp enough for planner handoff.

This status means: do an interview/grill-with-docs session before starting planning or implementation.

## When to mark `Interview`

Use this status when any of these are unresolved:

- user story or business value is fuzzy;
- acceptance criteria are missing, generic, or not testable;
- scope boundaries/out-of-scope items are unclear;
- implementation path could split into meaningfully different epics;
- dependencies or release lane are uncertain;
- UI/UX intent is unclear for UI-sensitive work;
- a previous artifact says user review/interview is still needed.

## When normal `Planned` is allowed

Use `Planned` only when roadmap has enough information for `/pidex` pre-flight to quickly confirm and route to planner:

- clear user story;
- concrete acceptance criteria;
- known constraints/out-of-scope items;
- no obvious product/domain ambiguity;
- dependencies/release lane understood well enough for planning.

## Orchestrator behavior

When presenting roadmap options:

- Label `Interview` items as interview-first.
- If user selects one, start the interview/grill phase for that epic; do not route directly to `pidex-planner`.
- If the orchestrator sees a `Planned` epic that still has obvious ambiguity by the criteria above, treat it as interview-first and mention that it appears misclassified.

## Roadmap-agent behavior

When creating or updating epics, pidex-roadmap should decide readiness from the criteria above and set `Status` accordingly. It should prefer `Interview` when uncertain rather than allowing premature planner handoff.
