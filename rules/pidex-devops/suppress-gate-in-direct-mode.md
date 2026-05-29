# Rule: Suppress External Gate Notifications in Direct Terminal Mode

PROC-NEW-49-3 | pidex-devops / orchestrator-side

## Rule

PIDEX v0.1 is direct-mode first. Gates MUST be presented in the current Pi terminal session unless a future release explicitly ships and enables a background notification service.

Do not call legacy background gate, lead, relay, or Telegram reply scripts from PIDEX v0.1 package instructions.

## What "present in terminal" means

Present the gate as a clear, structured terminal message:

```text
--- G4: Release Gate ---
Plan <id> (<slug>) committed locally as <hash>.
<N> tests green, coverage <X>%.

Push options:
  push   — push to remote and tag v<X.Y.Z>
  local  — keep local only, no remote push
  hold   — commit stays local, pipeline pauses
  abort  — revert the commit, abandon release

Your choice:
```

Then wait for the user's direct reply in the terminal.

## Why this matters

Direct terminal mode keeps gates observable and avoids duplicate or stale external notifications. Background gate transport can be revisited as a separate, explicitly shipped feature with its own scripts, docs, and tests.
