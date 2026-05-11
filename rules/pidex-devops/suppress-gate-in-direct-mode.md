# Rule: Suppress External Gate Notifications in Direct Terminal Mode

PROC-NEW-49-3 | pidex-devops (orchestrator-side)

## Rule

When the orchestrator detects that it is running in **direct mode** (interactive terminal
session with the user), it MUST NOT send the G4 gate notification via Telegram or any other
external channel. The gate MUST be presented in the terminal only.

## Detection: what is "direct mode"?

The orchestrator is in direct mode when ALL of the following are true:

1. The lead was NOT started via `~/running-pi/scripts/lead/start.sh` (no detached
   `--print` process in the background)
2. The orchestrator session is interactive — the user is actively present in the terminal
3. No `~/running-pi/state/pending-gate.json` exists from a prior background run

Heuristic for the orchestrator (check before calling `send-gate.sh`):

  # Is a background lead running?
  LEAD_PID=$(cat ~/running-pi/state/lead.pid 2>/dev/null)
  if [ -n "$LEAD_PID" ] && kill -0 "$LEAD_PID" 2>/dev/null; then
    BACKGROUND_MODE=true
  else
    BACKGROUND_MODE=false
  fi

If `BACKGROUND_MODE=false`: present the gate as plain terminal text. Do NOT call `send-gate.sh`.

If `BACKGROUND_MODE=true`: call `send-gate.sh` as normal (Rule 6 applies).

## What "present in terminal" means

In direct mode, the G4 gate MUST be presented as a clear, structured terminal message:

  --- G4: Release Gate ---
  Plan <id> (<slug>) committed locally as <hash>.
  <N> tests green, coverage <X>%.

  Push options:
    push   — push to remote and tag v<X.Y.Z>
    local  — keep local only, no remote push
    hold   — commit stays local, pipeline pauses
    abort  — revert the commit, abandon release

  Your choice:

Then wait for the user's direct reply in the terminal. Do NOT send a Telegram message in
addition to this — that creates redundant notification overhead and may confuse the user
if they are away from the terminal and see a Telegram message that has already been acted on.

## Why this matters

Plan 49 (editable-network-items, 2026-04-28): The G4 gate Telegram notification was sent
while the user was in an active direct terminal session co-piloting the pipeline. This created
redundant notification noise — the user had to respond to both the terminal prompt and dismiss
the Telegram notification. In direct mode, Telegram notifications are strictly unnecessary
because the user is already present.

## Exception: explicit user preference

If the user has explicitly said "always send Telegram for gates" or has configured a project-
level preference for external notifications, honor that preference and send via both channels.
Document the preference in the project's CLAUDE.md.

## Relationship to Rule 6

Rule 6 (Telegram routing for user-input gates) applies to **background mode** — when the
pipeline is running headless via `--print` and the user is NOT in the terminal. This rule
adds a direct-mode carve-out: Rule 6 is only triggered when the orchestrator cannot reach
the user through the terminal directly.

Both rules together form the complete gate routing policy:
- Background mode (lead.pid alive, no terminal): → Telegram via send-gate.sh (Rule 6)
- Direct mode (interactive terminal, user present): → terminal only (this rule)
