# Security brief: 4-provider-limits-native

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-provider-limits-native-plan.md`
Implementation docs:
- `agents.output/implementation/4-provider-limits-native-implementation.md`
- `agents.output/implementation/4-provider-limits-native-implementation-fix1.md`
Code review approval: `agents.output/code-review/4-provider-limits-native-code-review-v2.md`
Expected output: `agents.output/security/4-provider-limits-native-security.md`

Security scope:
- Python probe reads/writes `state/provider-limits/latest.json` and native source `state/provider-limits/native-records.json`.
- Dashboard API reads state and POST sets active profile.
- UI displays records.

Review for path traversal, unsafe filesystem writes, malformed JSON/object handling, API response leakage, profile mutation validation, XSS/rendering concerns, and denial-of-service risks. Do not modify files.

Fallow requirement for JS/TS scope: read `rules/pidex-security/fallow-structural-signal.md`; run the relevant fallow command or document `FALLOW-SKIP` with reason.

ROUTING must include `context_file: agents.output/security/4-provider-limits-native-security.md` and route to `pidex-qa` if approved.
