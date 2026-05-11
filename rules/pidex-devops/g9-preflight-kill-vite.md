# Rule: G9 Pre-flight — Kill Stale Vite Processes

PROC-NEW-48-4 | pidex-devops

## Rule

Before starting the dev server for G9 preview verification, always run:

```bash
pkill -f "vite.*--host" || true
```

This must execute before the `npm run dev` (or equivalent) command. The `|| true` ensures the
command succeeds even if no matching processes exist.

## When to apply

Any time pidex-devops (or the orchestrator) starts a dev server for a G9 preview gate.

## Why

Homelab dev sessions accumulate stale Vite processes from previous runs — server crashes,
killed terminals, background runs that did not clean up. Multiple Vite processes competing for
the same port cause the new dev server to either: fail to bind, bind to an incremented port
(not what was configured), or start successfully but serve stale cached content.

Killing existing processes before start guarantees a clean bind on the expected port and a
fresh module graph.

## Procedure

```bash
# Step 1: kill stale Vite processes
pkill -f "vite.*--host" || true

# Step 2: brief pause to allow port release (optional, usually not needed)
# sleep 1

# Step 3: start dev server as normal
npm run dev -- --host 0.0.0.0 &
```

If the project uses a wrapper script (e.g. `npm run preview`), still run the pkill before it.

## Scope

Applies whenever a dev server is started for G9. Does NOT apply to:
- CI test runs (vitest, not Vite dev server)
- Production build steps

## Empirical basis

Plan 48 (network-auto-analysis-pipeline, 2026-04-28): 8+ stale Vite processes required manual
killing before G9 preview could start with a clean dev server. Previous plans had similar
friction (noted as recurring in at least 2 prior retros). The kill step costs ~1 second and
eliminates a class of non-deterministic G9 failures.
