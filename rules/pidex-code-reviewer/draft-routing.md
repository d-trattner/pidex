# Rule: Draft ROUTING After First Write

PROC-NEW-1 (enforcement) | pidex-code-reviewer

## Rule

**Draft ROUTING immediately after first substantive Edit completes.**

Typically after writing Verdict or TDD Compliance section header. Emit `<!-- ROUTING -->` block with `verdict: IN_PROGRESS`. Do NOT wait until review is "ready." First Edit = trigger.

```html
<!-- ROUTING
verdict: IN_PROGRESS
route_to: pidex-security
reason: Code review in progress
context_file: agents.output/code-review/<id>-<slug>-code-review.md
-->
```

Guarantees routing signal even if cut off during deep code reading.

## Why

Reviewers that start with 20+ Reads before first Write stall with zero output every time. Write-first forces output structure commitment before reading begins.
