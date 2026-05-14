# PIDEX sketch intake tool idea

## Summary

Build a small disposable sketch-intake tool for PIDEX interview/preflight phases. When UI intent is ambiguous, the orchestrator can create a temporary sketch session, send the user a link, and let them draw a rough layout. The submitted sketch becomes an input artifact for planner/designer/implementer/uat context.

## Problem

Text-only UI preflight often misses spatial intent:

- layout hierarchy
- navigation placement
- mobile/desktop arrangement
- relative component sizing
- “put this here” feedback
- rough visual direction before implementation

A simple sketch can reduce ambiguity before plan/epic creation.

## Proposed flow

```text
orchestrator detects UI ambiguity
→ starts sketch session
→ sends user a tokenized link
→ user draws + optionally adds notes
→ user submits
→ service saves PNG/SVG + metadata
→ orchestrator includes sketch artifact in context pack
→ planner/designer/implementer/uat use it as input
```

## MVP scope

- Canvas drawing page.
- Pen tool.
- Eraser.
- Undo.
- Clear.
- Simple shape tools:
  - boxes/rectangles,
  - circles/ellipses.
- Shape manipulation:
  - select,
  - move,
  - resize,
  - rotate,
  - remove/delete.
- Text tool:
  - add text labels,
  - edit text,
  - move/resize/rotate text,
  - remove/delete text.
- Optional text notes.
- Optional `design.md` upload.
- Submit button.
- Save submitted sketch as PNG.
- Save editable scene JSON so agents or later sessions can inspect shape/text structure.
- Save uploaded `design.md` as a first-class design artifact when provided.
- Save session metadata as JSON.
- Session locks after submit.
- Session expires after a short period, e.g. 30 minutes.

## Suggested routes / API

Prefer implementing inside the existing dashboard/TanStack app first instead of a separate service.

Routes:

- `GET /sketch/:sessionId` — user drawing page.
- `POST /api/sketch/session` — create session.
- `GET /api/sketch/:sessionId` — read session state.
- `POST /api/sketch/:sessionId/submit` — submit image + notes + optional `design.md`.

Keep the tool simple. It is not meant to replace Figma/Excalidraw. It only needs enough structure for PIDEX to understand rough layout intent: boxes, circles, text, movement, resizing, rotation, remove/delete, and optional notes/design.md.

Optional CLI wrapper:

```bash
scripts/sketch/start.sh --project <project> --plan <plan-id>
```

Output example:

```text
Sketch link: http://pi.lan:18777/sketch/<session-id>
Waiting for submit...
```

## Artifact contract

Store under PIDEX output/state, for example:

```text
agents.output/sketches/<project>/<plan-id>/<timestamp>/sketch.png
agents.output/sketches/<project>/<plan-id>/<timestamp>/scene.json
agents.output/sketches/<project>/<plan-id>/<timestamp>/design.md      # optional upload
agents.output/sketches/<project>/<plan-id>/<timestamp>/metadata.json
```

Metadata example:

```json
{
  "type": "user_sketch",
  "project": "forge.ng",
  "plan": "041",
  "session_id": "abc123",
  "image": "agents.output/sketches/forge.ng/041/2026-05-13T000000Z/sketch.png",
  "scene": "agents.output/sketches/forge.ng/041/2026-05-13T000000Z/scene.json",
  "design_md": "agents.output/sketches/forge.ng/041/2026-05-13T000000Z/design.md",
  "notes": "optional user text",
  "created_at": "2026-05-13T00:00:00Z",
  "submitted_at": "2026-05-13T00:05:00Z"
}
```

## Orchestrator integration

Use when:

- task has UI/layout scope,
- user intent is spatial or ambiguous,
- designer/planner would otherwise need multiple clarification turns,
- user asks to sketch/draw/show layout.

After submit, include the sketch metadata path, image path, scene JSON path, and optional `design.md` path in the next agent context pack.

`design.md` is especially useful because it is already a common LLM-friendly design handoff format and can be generated/exported from other tools. If provided, planners/designers should treat it as authoritative design context alongside the sketch image.

Likely consumers:

- `pidex-planner`
- `pidex-designer`
- `pidex-implementer`
- `pidex-uat`

## Security / lifecycle

- Use unguessable session IDs.
- LAN/public dashboard compatible via tokenized URL.
- No general auth required for MVP if session ID entropy is high.
- Expire sessions by default.
- Lock submitted sessions.
- Avoid storing secrets in notes.

## Relationship to existing design workflow

This pairs with `design-snippet-preview`:

```text
user sketch in → designer/implementer → preview out
```

The sketch tool captures rough user intent; the existing preview workflow validates the implemented visual direction. If the user uploads `design.md`, that file can become the bridge between external design tools and PIDEX-native planning.

## Recommendation

Good candidate for a small future PIDEX epic. Keep MVP narrow and disposable: session creation, simple canvas/object editor, optional `design.md` upload, submit, artifact save, and orchestrator context integration.
