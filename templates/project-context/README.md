# PIDEX Project Context Templates

Use these templates to initialize `<project-root>/pidex/context/` for existing projects before running `/pd` with `grill-with-docs`.

## Single-context project

Most projects should start here:

```bash
mkdir -p <project-root>/pidex/context
cp <pidex-root>/templates/project-context/CONTEXT.md <project-root>/pidex/context/CONTEXT.md
```

Then open the dashboard Context page and fill only facts you know. Put guesses in **Open Questions / Needs User Review**.

## Multi-context project

Use this only when one project has clearly separate bounded contexts/domains:

```bash
mkdir -p <project-root>/pidex/context/contexts
cp <pidex-root>/templates/project-context/CONTEXT-MAP.md <project-root>/pidex/context/CONTEXT-MAP.md
cp -r <pidex-root>/templates/project-context/contexts/example <project-root>/pidex/context/contexts/<context-name>
```

## Truth policy

- User/domain expert owns truth.
- Agents may add confirmed facts or code-evidenced facts.
- Uncertain statements must stay under **Open Questions / Needs User Review**.
- Do not add general programming concepts; only project/domain language and constraints.
