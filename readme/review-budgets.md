# Bounded lifecycle review budgets

PIDEX limits lifecycle-tracked review dispatches. A budget is a **dispatch count**, not a token, cost, or time budget.

This policy applies to Critic, Code Review, Security, and QA gates in every execution mode: `host-direct`, `hardened-pipeline`, and `project-pipeline`.

## What one budget covers

One budget is identified by canonical project + `planId` + gate. `runFamilyId`, slice, remediation label, and a user's hardened choice cannot reset or increase it.

Each gate may use, at most, three reviews (initial, review 1, review 2) and two corrections (correction 1, correction 2).

Approval ends work early. More independent work needs a distinct `planId` and starts its own budget.

Critic corrections go to the Planner. Code Review, Security, and QA corrections go to the Implementer.

## One authoritative history

For a plan and gate, `${planId}.current` points to the root stream. That pointed root stream is the only ordered authority for review history.

An explicit tuple cannot select a different stream. PIDEX fails closed with bounded errors when history is missing, malformed, mismatched, or split across streams. Old split-stream histories may fail closed; do not manually repair them.

New lifecycle histories derive a collision-resistant key from the full canonical project path, so unrelated same-basename projects do not share review authority. An existing legacy history is reused only when exactly one active candidate identifies the same canonical project; ambiguity fails closed without migration or merging.

For direct Project Pipeline reviews, the registry-bound host or archive root is authoritative. PIDEX reloads and revalidates that authority after the child returns and before recording completion. A changed, missing, or relative root produces `REVIEW_PROJECT_AUTHORITY_CHANGED` and no completion event.

Existing lifecycle locks are never removed automatically from a stale owner observation. Dead, malformed, or otherwise uncertain ownership fails closed; recovery is an explicit operator concern rather than an opportunity to delete a successor-owned lock.

## Final rejection and returned uncertainty

After review 2 rejects, PIDEX does not dispatch correction 3, review 3, or a fourth reviewer. If structured TBR serialization is unavailable at that point, PIDEX keeps durable returned uncertainty with `TBR_WRITE_BLOCKED`.

This does not mean PIDEX automatically closes every TBR record. TBR serialization remains a separate operation and must succeed independently.

## Interruptions and provider attempts

Lifecycle-tracked review dispatches get one provider attempt. They do not retry or fall back to another provider.

A dispatch aborted before it starts uses zero attempts. Once a review dispatch is accepted, it is one-shot, including if it is interrupted. Ordinary non-review work keeps its normal retry/fallback behavior.

## What this limit does not cover

The budget does not limit all Planner or Implementer calls, total plans, tokens, cost, or elapsed time. A new `planId` creates an independent budget. Creating plans is therefore an orchestration and user-governance decision, not a way for a review request to raise its own limit.

## Minimal and proportional work

Minimal and proportional prompts can still use their legacy prompt breaker for nontracked/minimal work. Lifecycle-tracked reviews always use the executable aggregate budget described here. A user choice cannot raise that tracked-review limit.

## After updating PIDEX

After checking out an update, start a fresh Pi process or reload Pi before using the updated extension.
