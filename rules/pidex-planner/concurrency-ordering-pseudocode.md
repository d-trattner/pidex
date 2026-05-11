# Rule: Concurrency Ordering Pseudocode for Invariants

PROC-NEW-50-5 | pidex-planner

## Rule

When a plan specifies an ordering invariant — any statement of the form "X must happen
before Y" where incorrect ordering could cause data races, TOCTOU bugs, or observable
state inconsistencies — the plan MUST include a pseudocode block at the affected call site
(route handler, middleware, or event handler level):

  ```
  // BINDING — must match implementation exactly
  async function executeHandler(req, res) {
    const slot = registry.tryAcquire(id); // 1. reserve slot (sync)
    if (!slot) return res.status(409).json(...); // 2. reject if already running
    db.setStatus(id, "executing"); // 3. write status BEFORE 202
    res.status(202).json(...); // 4. return 202 to caller
    try {
      await runExecution(id, slot); // 5. async work after response
    } finally {
      registry.release(id); // 6. always release
    }
  }
  ```

## Trigger condition

Apply when the plan contains ANY of:
- "X before Y" ordering requirements between a status write and an HTTP response
- Concurrency guard (slot/lock) around async work
- TOCTOU-sensitive check-then-act patterns
- "must be synchronous" or "must complete before returning" constraints

## Why this matters

Plan 50 (execute-plan, 2026-04-29): TOCTOU fix required 2 code-review passes because prose
"status written before 202 returned" was ambiguous about the exact call site structure. The
first fix deferred start() (wrong); the second made it synchronous-with-deferred-interior
(correct). A 5-line pseudocode block would have collapsed this to 0 oscillation passes.
