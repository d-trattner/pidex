# Rule: Stall-Recovery Checkpoint

PROC-NEW-16 | pidex-implementer

## Rule

**When budget exhaustion approaching (>75% of maxTurns): STOP, commit what you have, finalize doc, emit final ROUTING NOW.**

Partial slice + committed state = recoverable. Zero commits + no ROUTING = requires orchestrator intervention.

## Stall Signal Protocol

**Primary stall signal**: stub-state output doc (see Output Discipline). Orchestrator treats stubbed output doc after idle as stall, no text needed.

**Secondary signal (emit when possible)**:

1. Impl doc entry — append to Slice Table Notes:
   ```
   STALL: committed through Slice N, budget exhausted at tool_use ~M, fresh spawn needed for Slice N+1 onwards
   ```

2. ROUTING directive — final output line:
   ```html
   <!-- ROUTING
   verdict: BLOCKED
   route_to: pidex-implementer
   reason: budget exhausted at Slice N, fresh spawn resumes from Slice N+1
   context_file: agents.output/implementation/<id>-<slug>.md
   -->
   ```

## Budget planning

`maxTurns × ~1.75 = approximate tool-call ceiling.`

Each commit costs ~2 Bash calls (`git add` + `git commit`) + ~1 Edit (Slice Table). For 6-slice plan = ~18 calls reserved for commit bookkeeping.

## Empirical basis

Plans 18-21 data shows agents killed mid-tool-call (6 stalls in Plan 21, 0 STALL text emissions). Most common kill point = inside Write or Bash, which produces no output. Stub-state doc = reliable signal; text = bonus when budget permits.
