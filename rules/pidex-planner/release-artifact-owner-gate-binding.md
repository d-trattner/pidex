# Release-Artifact Milestone Owner + Gate Binding (PROC-NEW-94-1)

If plan includes release-artifact/version milestone, planner must bind milestone to owner + target gate before Stage 2.

## Required fields

- Milestone name
- Artifact scope
- Owner role (`pidex-implementer`/`pidex-qa`/`pidex-devops`/named owner)
- Target gate (`G3`, `G4`, or explicit)
- Closure proof line

## Fail condition

If owner or gate missing, milestone invalid. Do not route plan forward.
