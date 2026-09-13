# Rule: PI Mode and User Decision Routing Consistency

PROC-NEW-PI-DECISION | pidex-pi / orchestrator

## Authority

This rule defines PI routing and decision interpretation for both explicit unbound work and producer-bound ordinary v2/recoverable v3 work. Producer IDs must belong to the current invocation; historical IDs in input documents are not a binding. Missing/ambiguous mode or identity remains blocked, never guessed or reconstructed.

Headings and keywords alone do not establish a pending decision. `User Decision Required`, `Suggested Agent Instruction Updates`, `defer` and `reject` may appear in a settled analysis. Read the actual proposal, requested action and task/user decision evidence. A self-written `decision_state` cannot grant approval and cannot override an actual unresolved user decision.

## Decision states

- `not_requested`: task explicitly excludes adoption, or there is no proposed change requiring a decision; advisory analysis only. No unsolicited implementation/approval cycle.
- `approved`: explicit user approval identifies exact changes and scope. Current write/frozen-source/operation boundaries must also permit them.
- `deferred`: user/task explicitly defers adoption; no implementation in this invocation.
- `rejected`: user explicitly rejects the proposed adoption; no implementation in this invocation.
- `pending`: an actual required user decision has not been answered.
- `unknown`: decision evidence, scope or authorization is missing/contradictory.

Missing or contradictory authorization evidence means `unknown`, not implicit approval. Do not use `not_requested` or `deferred` to hide an actual pending adoption request. General encouragement to continue is not approval of unspecified changes or a held-dispatch retry.

## Completed-analysis matrix

Applies only when analysis actually completed; other failures remain BLOCKED. `producer` means current boundary-assigned v2/v3 IDs; `unbound` must be explicit. `artifact_only` permits only the assigned analysis artifact. `approved_scope` additionally permits exact authorized changes, never unrelated maintenance or operations.

| Binding | decision_state | verdict | route_to | gate | writes |
|---|---|---|---|---|---|
| producer | not_requested | COMPLETE | orchestrator | none | artifact_only |
| producer | approved | COMPLETE | orchestrator | none | approved_scope |
| producer | deferred | DEFERRED | orchestrator | none | artifact_only |
| producer | rejected | DEFERRED | orchestrator | none | artifact_only |
| producer | pending | BLOCKED | user | G7 | artifact_only |
| producer | unknown | BLOCKED | user | G7 | artifact_only |
| unbound | not_requested | COMPLETE | pidex-roadmap | none | artifact_only |
| unbound | approved | COMPLETE | pidex-roadmap | none | approved_scope |
| unbound | deferred | DEFERRED | pidex-roadmap | none | artifact_only |
| unbound | rejected | REJECTED | pidex-roadmap | none | artifact_only |
| unbound | pending | BLOCKED | user | G7 | artifact_only |
| unbound | unknown | BLOCKED | user | G7 | artifact_only |

Rejecting adoption is not rejection of the analysis itself: producer mode uses DEFERRED plus `decision_state: rejected`. Do not emit REJECTED as a successful producer completion. Successful PI returns to orchestrator, which dispatches only actual pending consumers and owns terminal ACK. Unbound roadmap routing does not apply to producer-bound calls.

## Orchestrator enforcement

Before dispatch, provide mode, exact artifact path, inherited metadata, intended analysis/adoption scope and actual decision evidence. Resolve known approval needs before requesting implementation. Do not send incompatible read/write instructions.

After return, inspect the artifact's actual disposition and requested actions, not mere headings. If a required decision is pending, unknown or contradicted by the evidence, stop and ask the user through the current session with G7. Do not auto-complete, adopt changes, or silently relabel the state to fit the matrix. If settled, still require the producer's actual accepted return and all outstanding obligations.

The matrix is an instruction contract, not a new executable authorization token or a replacement for producer validation. Real user approval, runtime authority and operation boundaries remain required.

## G7 and bounded recovery

v3 resume cannot invoke a model, replace captured output, change a route or implement a new user answer. A BLOCKED/invalid captured return remains held; later approval does not repair that dispatch. Report the unresolved work and seek an explicit next workflow decision outside that held execution; do not create a replacement nonce/pipeline as an automatic workaround. Do not promise in-dispatch conversational continuation.

For unbound work, a user answer may authorize a new scoped task only under the actual current budget/route policy. This rule grants no automatic retries, fallback, extra starts or configuration adoption. Ordinary v2 and review lifecycles retain their existing executable limits; no v3 recovery is inferred for them.

## Evidence

Record the actual task/user authorization reference, scoped proposal disposition, changes made or none, and pending questions. Never fabricate approval records, receipts or runtime verdicts. Preserve G7 for genuine unresolved decisions while allowing genuinely settled advisory reports to complete.
