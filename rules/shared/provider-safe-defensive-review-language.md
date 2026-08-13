# Provider-Safe Defensive Review Language

PROC-PROVIDER-SAFE-1

## Purpose

Keep legitimate local engineering reviews usable across delegated models and automatic context summarization without weakening review depth, evidence, findings, or gates.

## Trigger

Apply whenever PIDEX creates agent tasks, context packs, progress messages, summaries, review artifacts, test descriptions, or ROUTING reasons for local reliability, data protection, trust-boundary, storage, filesystem, concurrency, authentication, authorization, or input-handling work.

## Required language contract

1. State the authorized local scope first: repository/worktree, changed components, and read-only or test-only boundary.
2. Describe work as verification of concrete defensive invariants, such as:
   - unauthorized state is rejected;
   - private data is not persisted or returned;
   - lineage and digests remain consistent;
   - malformed input fails closed;
   - concurrent operations remain bounded and atomic;
   - outward errors remain sanitized;
   - recovery and replay preserve authority boundaries.
3. Request deterministic local tests, code inspection, and evidence. Prefer exact expected state transitions and assertions over open-ended scenario narratives.
4. Include only the minimum technical detail needed for the assigned defensive check. Reference an artifact path instead of copying long raw logs, prior prompts, provider messages, payload collections, or unrelated findings.
5. Keep summaries outcome-focused: scope, invariant checked, command/evidence, result, residual risk, and next route.
6. Preserve accurate severity and remediation requirements. Language normalization must never hide a finding, skip a negative test, narrow the approved review scope, or convert a failed gate into a pass.

## Disallowed handoff shape

Do not ask an agent to discover, develop, optimize, demonstrate, or enumerate harmful operational techniques. Do not include hypothetical misuse walkthroughs when a defensive invariant and local regression assertion express the same requirement.

This wording rule does not prohibit ordinary secure-code review. It changes task framing and context volume, not the technical standard.

## Provider-refusal recovery

If a delegated model or automatic summarizer refuses a legitimate local review:

1. Do not repeatedly resend the same text.
2. Create a fresh compact context pack containing only:
   - authorized local scope;
   - affected file paths;
   - defensive invariants;
   - exact local test commands or assertions;
   - required output path and ROUTING contract.
3. Remove copied provider messages, raw historical prompts, broad transcripts, and unnecessary scenario prose.
4. Retry once with the compact defensive context.
5. If refusal persists, record `PROVIDER-SAFE-BLOCKED` and route to the orchestrator or another configured eligible provider. Never fabricate a review result.

## Compact handoff template

```text
AUTHORIZED LOCAL REVIEW
Scope: <repository/worktree and files>
Mode: read-only verification | local test-only verification
Defensive invariants:
- <expected fail-closed or integrity property>
- <privacy/lineage/concurrency property>
Evidence: <targeted commands or artifact paths>
Output: <assigned artifact>
Preserve all findings and gate semantics. Keep final response compact.
```
