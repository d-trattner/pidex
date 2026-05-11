# Shared UI Primitives Default

## Trigger
Apply when implementation touches UI tables, lists, badges, cards, scroll wrappers, controls, or other repeated domain/UI patterns.

## Rule
Implementer must check existing shared primitives before creating bespoke markup.

Required implementation-doc evidence:

| Pattern needed | Existing primitive checked | Decision | Exception? |
|---|---|---|---|

For domain tables, default to shared `Table*` primitives or real semantic table markup. A bespoke structure is allowed only with an explicit exception:

```markdown
Shared primitive exception:
- Reason:
- Risk:
- Rollback:
```

## Non-compliance
Missing inventory or missing exception for bespoke table/list markup is non-compliant and should route back before code review approval.

## Failure mode prevented
Prevents fake table/list implementations and one-off markup drift when a project already has semantic/shared primitives.
