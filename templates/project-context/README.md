# PIDEX Project Context Templates

Use these templates to initialize `<project-root>/pidex/context/` for existing projects before running `/pd` with `grill-with-docs`.

PIDEX context follows Matt Pocock's `CONTEXT.md` shape exactly: language, relationships, example dialogue, and flagged ambiguities. It is not a project database, task spec, roadmap, workflow document, architecture document, or operational runbook.

## Single-context project

Most projects should start here:

```bash
mkdir -p <project-root>/pidex/context
cp <pidex-root>/templates/project-context/CONTEXT.md <project-root>/pidex/context/CONTEXT.md
```

## Multi-context project

Use this only when one project has clearly separate bounded contexts/domains:

```bash
mkdir -p <project-root>/pidex/context/contexts
cp <pidex-root>/templates/project-context/CONTEXT-MAP.md <project-root>/pidex/context/CONTEXT-MAP.md
cp -r <pidex-root>/templates/project-context/contexts/example <project-root>/pidex/context/contexts/<context-name>
```

## Truth policy

- User/domain expert owns truth.
- Agents may add confirmed terms from user statements or clear code evidence.
- If unsure, ask or record the ambiguity under `Flagged Ambiguities`.
- Do not add general programming concepts; only project/domain language belongs here.
