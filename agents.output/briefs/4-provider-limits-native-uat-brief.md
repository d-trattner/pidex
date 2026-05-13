# UAT brief: 4-provider-limits-native

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-provider-limits-native-plan.md`
QA: `agents.output/qa/4-provider-limits-native-qa.md`
Security approval: `agents.output/security/4-provider-limits-native-security-v5.md`
Expected output: `agents.output/uat/4-provider-limits-native-uat.md`

UAT objective: verify user-facing acceptance for PIDEX-native provider-limits:
- `/limits` shows native `codex` and `codex-spark` rows when seeded/native records exist.
- No recommendation copy/profile recommendation behavior in UI/API.
- Profiles `codex-optimized` and `codex-high` remain visible/usable as active profile controls.
- Browser screenshots exist: desktop/mobile under `dashboard/.playwright/4-provider-limits-*.png`.
- Security constraints do not break local operator usage.

Do not modify files. If user visual preview is still required, emit `gate: G9`; otherwise approve and route devops.

ROUTING must include `context_file: agents.output/uat/4-provider-limits-native-uat.md`.
