# Rule: RED/GREEN/Non-TDD Evidence Block

PROC-NEW-1 | pidex-implementer

## Goal

Force uniform proof packet before first review handoff.

## Requirement

Before first review request, implementation doc MUST include explicit 3-lane block:

- `RED` — failing test evidence with command + failure snippet.
- `GREEN` — passing test evidence with command + pass snippet.
- `Non-TDD` — any non-TDD work item with reason and scope boundary. Use `None` when empty.

If any lane missing, handoff not ready.

## Scope

Applies to all slices with test or behavior changes.

## Validation

Reviewer checks lane presence + evidence traceability in implementation doc.