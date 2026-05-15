---
name: pdmem
description: Save a lightweight PIDEX project session memory snapshot to <project-root>/wiki/session-memory/ when the user invokes /pdmem.
---

# /pdmem — PIDEX Project Session Memory

Use when the user invokes `/pdmem` or asks to save a PIDEX project session memory.

Behavior is implemented by the PIDEX extension command `/pdmem`.

- Saves a lightweight session snapshot to `<project-root>/wiki/session-memory/`.
- Updates `<project-root>/wiki/session-memory/index.md`.
- Uses the git root of the current cwd as project root when available.
- Does not perform automatic prompt injection, shutdown capture, topic scoring, or compression.
- Do not store secrets or credential values.
