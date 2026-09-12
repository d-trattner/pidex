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

A fresh host caller may supply the complete `reviewIdentity` tuple without setting a pipeline environment variable. When no lifecycle/pipeline context was supplied, PIDEX resolves the existing opening from canonical project + `planId`; it never invents an ID from the working-directory name or equates `runFamilyId` with the pipeline ID. The selected supplied context (explicit lifecycle, otherwise `RUNNING_PI_PIPELINE_ID`, then `PIDEX_PIPELINE_ID`) remains binding and must match the recorded authority; existing precedence is unchanged. Missing/corrupt authority is not created or repaired by dispatch. Recovery still uses the same identity, remaining physical ordinal and authenticated execution evidence; an accepted identity cannot be dispatched again.

An explicit tuple cannot select a different stream. PIDEX fails closed with bounded errors when history is missing, malformed, mismatched, or split across streams. Old split-stream histories may fail closed; do not manually repair them.

New lifecycle histories derive a collision-resistant key from the full canonical project path, so unrelated same-basename projects do not share review authority. An existing legacy history is reused only when exactly one active candidate identifies the same canonical project; ambiguity fails closed without migration or merging.

For direct Project Pipeline reviews, the registry-bound host or archive root is authoritative. PIDEX reloads and revalidates that authority after the child returns and before recording completion. A changed, missing, or relative root produces `REVIEW_PROJECT_AUTHORITY_CHANGED` and no completion event.

Existing lifecycle locks are never removed automatically from a stale owner observation. Dead, malformed, or otherwise uncertain ownership fails closed; recovery is an explicit operator concern rather than an opportunity to delete a successor-owned lock.

## Final rejection and returned uncertainty

After review 2 rejects, PIDEX terminalizes automatically: every remaining active and immediate finding is archived, the lifecycle completes `closed`, and the typed status is `CLOSED_WITH_TBR`. The gate advances exactly once; PIDEX never dispatches correction 3, review 3, or a fourth reviewer, and the ordinary rejection count alone never asks the user.

`TBR_WRITE_BLOCKED` remains only a persistence/validation failure: if the TBR archive write or lifecycle validation cannot complete, PIDEX fails closed with the typed `TBR_WRITE_BLOCKED` status and appends no false terminal outcome; a same-identity retry resumes idempotently. Terminalization is automatic and durable, not a separate user-visible step.

## Interruptions and physical provider attempts

Every automatic generation has fixed maximum: `initial physical execution + one automatic retry`. A retry is retryable only for bounded transient launch failure, accepted-child nonzero exit, timeout, turn limit, or malformed completion (no final text, incomplete stream, invalid/missing ROUTING, invalid assigned artifact). Auth, identity, lifecycle lock/I/O, security, write-fence, configuration, project-authority, deterministic input failure, and user abort do not retry. Unknown classification fails closed.

Ordinary host work executes at most two physical providers total. Its second/final execution is same-provider retry or configured fallback, never both. Lifecycle-tracked Primary keeps configured route/model for retry. Exhausted Primary becomes typed `PRIMARY_REVIEW_UNAVAILABLE`; main/adjudicator becomes typed essential hold. These results stop orchestration; they are not completion or phase success.

Trusted outer orchestrator shows hold and asks user. Only after an intervening affirmative user response may it submit exact single-use `resumeHoldId + resumeConfirmed:true`, bound to held identity; no provider/model override, automatic resume, or resume slash command exists. Exhausted advisory Secondary is `DEGRADED_FAILED`: preserve safe reason and attempt summaries, continue Primary/other lanes, and never treat missing findings as approval.

A dispatch aborted before it starts uses zero physical executions. Accepted failure records distinct physical outcome (`FAILED_TO_RUN`, `TIMED_OUT`, `TURN_LIMIT_HIT`, or `MALFORMED_COMPLETION`) without consuming reviewer/correction budget.

## What this limit does not cover

The budget does not limit all Planner or Implementer calls, total plans, tokens, cost, or elapsed time. A new `planId` creates an independent budget. Creating plans is therefore an orchestration and user-governance decision, not a way for a review request to raise its own limit.

## Minimal and proportional work

Minimal and proportional prompts can still use their legacy prompt breaker for nontracked/minimal work. Lifecycle-tracked reviews always use the executable aggregate budget described here. A user choice cannot raise that tracked-review limit.

## After updating PIDEX

After checking out an update, start a fresh Pi process or reload Pi before using the updated extension.
