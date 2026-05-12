# QA brief: 4-provider-limits-native

Project cwd: `/home/daniel/pidex`
Plan: `agents.output/planning/4-provider-limits-native-plan.md`
Implementation docs:
- `agents.output/implementation/4-provider-limits-native-implementation.md`
- `agents.output/implementation/4-provider-limits-native-implementation-fix1.md`
- `agents.output/implementation/4-provider-limits-native-security-fix.md`
- `agents.output/implementation/4-provider-limits-native-security-fix2.md`
- `agents.output/implementation/4-provider-limits-native-security-fix3.md`
- `agents.output/implementation/4-provider-limits-native-security-fix4.md`
Security approval: `agents.output/security/4-provider-limits-native-security-v5.md`
Expected output: `agents.output/qa/4-provider-limits-native-qa.md`

QA scope:
- Probe writes native latest state from PIDEX source (`state/provider-limits/native-records.json`) and no `recommended_profile`.
- API `/api/provider-limits`, `/api/provider_limits`, profile routes return records and no recommendation field.
- `/limits` UI shows codex/codex-spark rows when seeded/native data exists.
- Secure loopback/public-bind auth behavior remains validated.
- Build/typecheck/tests pass.

Run Fallow static audit per `rules/pidex-qa/fallow-static-audit-gate.md`; do not mark COMPLETE without fallow evidence or FALLOW-SKIP.

Collect browser/screenshot evidence if feasible; if browser smoke blocked, route to orchestrator with `reason` containing `browser smoke BLOCKED`.

ROUTING must include `context_file: agents.output/qa/4-provider-limits-native-qa.md`.
