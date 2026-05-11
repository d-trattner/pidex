# Rule: Protocol Pseudocode Must Be Binding

PROC-NEW-50-6 | pidex-planner

## Rule

Pseudocode in a plan that defines a message protocol (JSON envelope format, LLM
multi-turn transcript structure, API request/response shape, wire format) MUST be
labelled one of:

  BINDING CONTRACT — implementation must match exactly
  NON-BINDING EXAMPLE — for illustration only; implementation may differ

The label "ILLUSTRATIVE ONLY" is PROHIBITED on pseudocode that specifies:
- JSON message envelope structures
- Role assignments in LLM conversation turns
- HTTP request bodies or response shapes
- Binary or text wire protocol formats

If the pseudocode is load-bearing (any implementation deviation from it would cause
runtime failure or incorrect behavior), it MUST be labelled BINDING CONTRACT.

## Why this matters

Plan 50 (execute-plan, 2026-04-29): The repair conversation 3-turn seed structure was
labelled "ILLUSTRATIVE ONLY" but was a load-bearing protocol contract (role assignment:
user/assistant/user, exact turn ordering). The ambiguity caused the message framing to
be addressed in Revision 3 and then re-addressed in later code-review passes. Changing
the label to BINDING CONTRACT collapses this ambiguity to zero.

## Guidance for planners

Ask: "If the implementer deviates from this pseudocode, will the feature work correctly?"
- YES → label it BINDING CONTRACT
- NO → label it NON-BINDING EXAMPLE
- UNSURE → label it BINDING CONTRACT (conservative default)
