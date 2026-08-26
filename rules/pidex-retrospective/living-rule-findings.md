# Rule: Living Rule Findings

## Producer contract

After successful retrospective `context_file`, producer writes only fixed sibling `<same-basename>.rule-learning.json`; no wildcard discovery. Sidecar must be regular, single-link, confined under `agents.output/retrospective/`, archive-owned in Project Pipeline. Retrospective may emit only privacy-safe canonical `pidex-rule-learning-finding-v1` envelopes in this sidecar or hand them to configured learning intake. Envelope fields, exact order: `schema_version`, `finding_id`, `producer`, `completed_run_id`, `plan_id`, `project_scope_id`, `repository_identity`, `taxonomy`, `affected_agent`, `affected_phase`, `recurrence_key`, `lesson_summary`, `evidence_digests`, `occurred_at`, `redaction_classes`.

Producer value is `pidex-retrospective`. Unknown, missing, malformed, sensitive, or noncanonical fields reject. Emit bounded safe lesson summary and immutable evidence digests only.

Raw prompts, source paths, credentials, secrets, and unrestricted logs are forbidden.

## Authority boundary

Finding emission and handoff are evidence only. No publication authority. Do not create candidates, cast votes, activate rules, write canonical rules, commit, push, or bypass admission, enrollment, reviewer, privacy, transaction, or receipt gates.
