# Rule: Status Enum UI Affordance Audit

PROC-NEW-50-7 | pidex-planner

## Rule

When a plan adds, removes, or renames status values on an entity that is rendered in the
UI, the plan MUST include a "Status Enum Audit" table that enumerates EVERY status value
(existing AND new) with a UI affordance column:

  ### Status Enum Audit — [EntityName]
  | Status Value | Transition Target(s) | UI Affordance | Notes |
  |---|---|---|---|
  | pending-approval | approved, abandoned | Approve Plan button + Abandon button | NEW in this plan |
  | approved | executing | (no action — read-only badge) | Existing |
  | executing | review-pending, failed | (no action — progress indicator) | NEW |
  | review-pending | approved, failed | Approve + Reject + Repair buttons | NEW |
  | failed | pending-approval | Retry button | NEW |

Every row MUST have a non-empty "UI Affordance" entry — either a named action component or
"read-only display: [description]". Blank cells are blocking pre-implementation findings.

## Trigger condition

Apply when the plan contains ANY of:
- Adding new status values to an existing status enum
- Adding a new entity type with a status field that is rendered in the UI
- Changing the set of valid status transitions in an entity

## Relationship to consumer-audit.md (PROC-NEW-49-2)

consumer-audit.md covers: "which components render this entity, and do they wire the
new props?" This rule covers: "for each status value, does the UI have the correct
affordance?" They are orthogonal and both should be applied when a plan adds status
values to a UI-rendered entity.

## Why this matters

Plan 50 (execute-plan, 2026-04-29): The plan audited new status consumers for executing,
review-pending, and failed, but missed the pending-approval → approved UI affordance.
The Approve Plan button existed in server logic but had no UI counterpart. Caught during
live review and UAT. A complete status audit table at plan time prevents this gap.
