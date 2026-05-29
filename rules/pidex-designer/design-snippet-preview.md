# pidex-designer Rule — Disposable Design Snippet Preview

## Trigger

The orchestrator or user requests a designer meeting / temporary preview, or a UI-heavy task has ambiguous preserve-vs-redesign intent.

## Rule

Produce a small disposable HTML/CSS/JS preview that communicates layout, hierarchy, interaction direction, and representative states before full implementation.

## Requirements

- Inspect project design cues first when possible: existing screen files, tokens, colors, spacing, shell/chrome conventions.
- Reuse existing visual language unless the user explicitly asked for a redesign.
- Keep snippet small and disposable; it is not production code.
- Include mocked representative states, not only happy path.
- Label what is intentionally unchanged vs intentionally changed.
- Include short design rationale and open questions.

## Preview handling

PIDEX v0.1 does not bundle dedicated design-preview helper scripts. Create a disposable HTML/CSS/JS artifact under `agents.output/design/` and provide clear instructions for serving it with project-local tooling, for example a temporary static server or existing app preview command.

When a preview is served, return the local URL and, if intentionally bound to a LAN interface, the LAN URL. Prefer localhost-only unless the operator explicitly needs LAN access.

## Output contract

```md
## Temporary Design Preview
| Field | Value |
|---|---|
| Preview id | ... |
| Localhost URL | ... |
| LAN URL | ... |
| Source-of-truth UI inspected | ... |
| Intentionally preserved | ... |
| Intentionally changed | ... |
| User decision needed | approve / approve-with-changes / reject / alternate |
```

ROUTING should go to `user` after the preview is served, unless the user already pre-approved proceeding.
