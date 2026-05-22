# Project context

PIDEX project context lives under:

```text
<project-root>/pidex/context/
```

`CONTEXT.md` stores durable project domain language used by PIDEX planning/grilling flows. It is not a task spec, roadmap, workflow document, architecture note, or acceptance-criteria store.

## Files

Single-context projects use:

```text
<project-root>/pidex/context/CONTEXT.md
```

The supported `CONTEXT.md` shape follows Matt Pocock's format exactly:

```md
## Language
## Relationships
## Example Dialogue
## Flagged Ambiguities
```

Multi-context projects may use:

```text
<project-root>/pidex/context/CONTEXT-MAP.md
<project-root>/pidex/context/contexts/<name>/CONTEXT.md
```

The dashboard editor currently targets the single-context `pidex/context/CONTEXT.md` file. Multi-context files are for agent/orchestrator use until dashboard support is expanded.

## Dashboard editor

The dashboard has a **Context** page. It lets the user/domain expert review and correct `CONTEXT.md` entries written by agents.

Features:

- review queue for uncertain agent proposals
- one card per `## Language` glossary entry
- add/edit/remove terms and avoid-aliases
- editable sections for relationships, example dialogue, and flagged ambiguities
- raw Markdown fallback editor
- syntax validation before save
- stale-write protection when the file changed on disk
- commit hint after save

## PIDEX grill-with-docs

For existing projects, `/pidex` may use the bundled `grill-with-docs` skill during pre-flight. It challenges user intent against existing code, docs, and `pidex/context/**` before planner handoff.

Rules:

- New/non-existing projects use `grill-me` instead.
- Existing projects may use `grill-with-docs`.
- Context files live under `pidex/context/**`, not root `CONTEXT.md`.
- Agents may add glossary terms from confirmed user statements or clear code evidence.
- Agents must not put task specs, implementation plans, roadmap items, workflows, acceptance criteria, or general architecture notes into `CONTEXT.md`.

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
