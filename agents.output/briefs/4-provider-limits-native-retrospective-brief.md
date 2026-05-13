# Retrospective brief: 4-provider-limits-native

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-provider-limits-native-plan.md`
Devops: `agents.output/devops/4-provider-limits-native-devops.md`
Security docs include mandatory retro triggers:
- `agents.output/security/4-provider-limits-native-security.md`
- `agents.output/security/4-provider-limits-native-security-v2.md`
- `agents.output/security/4-provider-limits-native-security-v4.md`
QA: `agents.output/qa/4-provider-limits-native-qa.md`
Expected output: `agents.output/retrospective/4-provider-limits-native-retrospective.md`

Full retro required due security findings:
- SEC-1 unauthenticated network-exposed provider-limits API; resolved by loopback default + public-bind token controls.
- SEC-3 critical `@tanstack/react-start@1.167.71` dependency advisory; resolved by pinning `1.167.65`, lockfile regen, audit clean.
- QA/browser smoke initially blocked; orchestrator collected Chromium evidence and LAN screenshot preview.
- Devops held local/no push due dirty workspace and explicit local posture.

Write concise lessons, process improvements, and post-retro handoffs if needed. Do not modify product code.

ROUTING must include `context_file: agents.output/retrospective/4-provider-limits-native-retrospective.md` and route to `pidex-pi`.
