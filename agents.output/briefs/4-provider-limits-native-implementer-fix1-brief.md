# Implementer fix brief: 4-provider-limits-native

Project cwd: `/home/daniel/pidex`
Plan: `agents.output/planning/4-provider-limits-native-plan.md`
Implementation: `agents.output/implementation/4-provider-limits-native-implementation.md`
Code review rejection: `agents.output/code-review/4-provider-limits-native-code-review.md`
Expected output: `agents.output/implementation/4-provider-limits-native-implementation-fix1.md`

Fix the code-review rejection only:
- MAJOR-1: Probe currently echoes existing `latest.json` or empty records. Implement a minimal PIDEX-native provider-limit record source/fixture contract that can produce `codex` and `codex-spark` records when available, without `/home/daniel/running-pi`.
- MINOR-1: Strengthen tests to assert records shape, active/profile preservation, and exact `codex`/`codex-spark` pass-through/collection from the supported source.

Guidance:
- Keep scope small and deterministic.
- Prefer PIDEX-owned state input under `state/provider-limits/` if no live provider API is safely available; document the source contract clearly. The probe must actively read/normalize from this native source into `latest.json`, not just echo `latest.json`.
- Ensure generated latest has no `recommended_profile`.
- Rerun focused tests and relevant checks.
- Preserve unrelated dirty changes.

ROUTING must include `context_file: agents.output/implementation/4-provider-limits-native-implementation-fix1.md` and route to `pidex-code-reviewer` when complete.
