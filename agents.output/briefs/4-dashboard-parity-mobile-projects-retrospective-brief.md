# Retrospective brief: dashboard parity mobile/project selector

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
Devops: `agents.output/devops/4-dashboard-parity-mobile-projects-devops.md`
Security docs: `agents.output/security/4-dashboard-parity-mobile-projects-security.md`, `agents.output/security/4-dashboard-parity-mobile-projects-security-v3.md`
QA/UAT: `agents.output/qa/4-dashboard-parity-mobile-projects-qa.md`, `agents.output/qa/4-dashboard-parity-mobile-projects-g9-fix2-qa.md`, `agents.output/uat/4-dashboard-parity-mobile-projects-g9-fix2-uat.md`
Expected output: `agents.output/retrospective/4-dashboard-parity-mobile-projects-retrospective.md`

Full retro required due mandatory security trigger and G9 rejection. Capture:
- What went well: findings-first approval, critic caught designer/profile issue, security caught dependency/error leakage, code review caught token/live/page reset/cascade issues, G9 upstream rule added.
- What went wrong: Playwright missing caused orchestrator fallback; screenshot evidence did not prove one-card-per-row; G9 URL 502 due bind mismatch; QA status/routing inconsistencies; devops returned no final text once.
- Improvement recommendations, especially for future orchestration-quality metric epic.

Do not modify product code. ROUTING context_file must be expected output and route to pidex-pi.
