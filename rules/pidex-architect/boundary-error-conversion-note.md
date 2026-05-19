# Rule: Boundary Error Conversion Note

PROC-NEW-7-3 | pidex-architect

## Trigger
Plan introduces or edits error conversion at API route/service boundaries (boundary mappers, adapter-to-route error translation, degraded-path mapping).

## Rule
Before APPROVED verdict, architecture findings MUST include reusable boundary conversion note with:

- Single conversion helper ownership (no duplicate ad-hoc conversions in callers)
- Typed boundary conversion contract (`external -> internal` mapping)
- Deterministic mapping of boundary error to `next_action` and blocker category
- Evidence row proving no raw upstream/topology details leak in client-facing errors

## Required sections
- `Boundary Error Conversion` block in architecture findings
- Minimal, reusable snippet for future plans that changes same boundary class
- Reference to this snippet from implementation handoff summary

## Fail condition
Missing block or untyped/mutating conversion helper => architecture review cannot be APPROVED (use APPROVED_WITH_CHANGES or REJECTED).
