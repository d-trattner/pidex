# Rule: External CLI Spawn PATH Construction Invariant

PROC-NEW-36c | pidex-planner

## Rule

When a plan includes spawning an external CLI tool from a Vite-adjacent Node process —
including TanStack Start server routes, Vite plugins, vite.config.ts hooks, or any process
launched via npm run — the plan MUST document a PATH invariant:

  PATH-1 — CLI spawn PATH: [tool] is spawned with an explicit PATH constructed from
  os.homedir() + known install directories. Does not rely on inherited process.env.PATH
  (Vite/npm strips user PATH segments including ~/.local/bin, ~/.bun/bin).

Add this row to the Plan Invariants table or Assumptions table.

## Why this matters

npm and Vite strip user-level PATH segments when launching child processes. Binaries installed
in ~/.local/bin, ~/.bun/bin, or similar user-level locations are invisible to
spawnFile(cliName) with an inherited PATH. The call fails with ENOENT even though the binary is
installed and works from an interactive shell.

Correct pattern: construct a PATH string from os.homedir() plus known install dirs
(~/.local/bin, ~/.bun/bin, /usr/local/bin, /usr/bin, /bin) and pass it explicitly in the
spawn env option.

## Trigger condition

Apply when plan contains ANY of:
- spawn, execFile, or exec with a non-absolute binary name
- "invoke [CLI tool] from server route" or equivalent
- A server function / server route that shells out to an external tool

Does NOT apply to:
- Absolute paths in the spawn call — already path-safe
- Scripts run from interactive shell context (not Vite/npm child process)
- node child processes (node binary itself resolved by npm correctly)

## Empirical basis

Plan 36 (chat-llm-wiring, 2026-04-25): G9-R2a — invoking claude binary in a TanStack Start
server route failed with ENOENT. The claude binary lives in ~/.local/bin, which was stripped
from PATH by the npm/Vite process context. Fix: constructed explicit PATH string with all
known install directories. One plan invariant row prevents this entire failure class.
