# Project context

PIDEX project context lives under:

```text
<project-root>/pidex/context/
```

It stores durable domain language and lightweight architectural decision records used by PIDEX planning/grilling flows.

## Files

Phase 1 supports the single-context glossary:

```text
<project-root>/pidex/context/CONTEXT.md
```

Future phases may add:

```text
<project-root>/pidex/context/CONTEXT-MAP.md
<project-root>/pidex/context/contexts/<name>/CONTEXT.md
<project-root>/pidex/context/adr/*.md
```

## Dashboard editor

The dashboard has a **Context** page. It lets the user/domain expert review and correct `CONTEXT.md` entries written by agents.

Phase 1 features:

- one card per `## Language` glossary entry
- add/edit/remove terms
- raw Markdown fallback editor
- syntax validation before save
- stale-write protection when the file changed on disk
- commit hint after save

## Ownership

Agents may update context during `grill-with-docs`, but the user/domain expert owns truth. Review context periodically to catch misunderstandings or unhelpful terms.

## Commit policy

`pidex/context/**` is durable project metadata and is commit-eligible.

`agents.output/**` remains generated runtime output and must not be committed.

Suggested commit:

```bash
git add pidex/context/CONTEXT.md
git commit -m "docs(context): update project glossary"
```
