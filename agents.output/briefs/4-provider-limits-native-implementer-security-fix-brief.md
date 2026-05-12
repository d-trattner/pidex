# Implementer security fix brief: 4-provider-limits-native

Project cwd: `/home/daniel/pidex`
Plan: `agents.output/planning/4-provider-limits-native-plan.md`
Security review: `agents.output/security/4-provider-limits-native-security.md`
Expected output: `agents.output/implementation/4-provider-limits-native-security-fix.md`

Fix SEC-1 only, scoped and minimal:
- Provider-limits API/profile read/write endpoints are unauthenticated while dashboard binds `0.0.0.0`.
- Add controls before QA/release. Preferred minimal path: provider-limits endpoints enforce localhost/same-origin protection suitable for operator dashboard.
- Reads: protect sensitive provider-limit data from non-local network callers, or require explicit token if non-local.
- Writes: validate Origin/Host/same-origin and require local/token control; keep profile allowlist.
- If changing bind defaults is the safest minimal control, ensure validation/start scripts still work and document LAN preview implications.
- Add/update tests for blocked non-local/cross-origin provider-limits access/mutation where feasible.

Constraints:
- Do not broadly redesign auth for dashboard.
- Preserve `/limits` working locally and API validation commands.
- Preserve codex/codex-spark provider rows and no recommendation behavior.
- Preserve unrelated dirty changes.

ROUTING must include `context_file: agents.output/implementation/4-provider-limits-native-security-fix.md` and route to `pidex-security` when complete.
