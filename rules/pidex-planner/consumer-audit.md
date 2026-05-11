# Rule: Consumer Audit for Entity Mutation Plans

PROC-NEW-49-2 | pidex-planner

## Rule

When a plan involves mutating (editing, deleting, or transforming) a shared entity — any
data object rendered by more than one component — the Research phase MUST include a
Consumer Audit step that identifies every view, container, and route that renders that entity.

The plan's implementation steps MUST address all identified consumers, not only the primary
management page or the component directly named in the epic.

## Consumer Audit step (add to Research phase)

After identifying the entity being mutated, run:

  grep -r "<EntityName\|entityName\|entityProp" src/ --include="*.tsx" --include="*.ts" \
    -l | sort

Then for each file found:
- Determine whether it renders the entity in a way that requires the new mutation capability
  (e.g., an Edit button, an onEdit callback, a writable prop)
- If YES: add a wiring subtask to the plan for that file
- If NO (read-only display only): document it explicitly as "Consumer — read-only, no wiring
  required" so reviewers know it was considered

## Deliverable in the plan doc

Add a "Consumer Audit" section to the Research findings block:

  ### Consumer Audit — <EntityName>
  | File | Role | Wiring Required? |
  |------|------|-----------------|
  | src/pages/network-page.tsx | Primary management page | YES — onEdit handler |
  | src/views/OverviewView.tsx | Summary container | YES — onEdit passthrough |
  | src/components/ItemCard.tsx | Leaf display component | YES — inline edit UI |
  | src/pages/dashboard.tsx | Read-only widget | NO — displays count only |

The plan MUST include an implementation subtask for every row marked YES.

## Why this matters

Plan 49 (editable-network-items, 2026-04-28): pidex-code-reviewer rejected the first pass
because the plan wired `onEdit` in `network-page.tsx` and `ItemCard.tsx` but omitted
`OverviewView.tsx`, which also renders `ItemCard` instances. The omission caused a
code-review rejection and a hotfix cycle.

The root cause was that the plan's Research phase searched only the primary route for the
entity, not all components that render it. A systematic grep during planning would have
surfaced `OverviewView` immediately.

## Scope

This rule applies when the plan includes ANY of:
- Adding a callback prop to a component (onEdit, onDelete, onApprove, etc.)
- Changing a read-only component to an interactive one
- Adding a new required prop to an existing component
- Changing the data shape of an entity passed between components

It does NOT apply to:
- Plans that add entirely new components with no existing consumers
- Plans that only add new API routes with no UI changes
- Pure styling or copy changes

## Relationship to existing rules

- Complements `msw-handler-scope-audit.md` (which audits mock coverage, not component wiring)
- Complements `new-endpoint-msw-handler-audit.md` (pidex-implementer equivalent)
- The Consumer Audit output feeds directly into the Implementation phase's TDD test list:
  each YES row in the audit = at least one integration test verifying the wiring
