# Project Session Memory

PIDEX provides a project-scoped memory shortcut:

```text
/pdmem optional note
```

## Behavior

`/pdmem` writes a lightweight session snapshot to the selected project wiki:

```text
<project-root>/wiki/session-memory/
```

It also updates:

```text
<project-root>/wiki/session-memory/index.md
```

## Scope

Use `/pdmem` for project-specific notes, decisions, and save points.

Use global `/mem` for user/global session notes that do not belong to a specific project.

## Canonical wiki path

PIDEX expects project wikis at:

```text
<project-root>/wiki/
```

Legacy `agents.wiki.*` paths are archival/legacy and should not be recreated for active project memory.
