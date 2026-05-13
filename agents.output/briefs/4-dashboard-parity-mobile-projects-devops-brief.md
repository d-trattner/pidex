# Devops brief: dashboard parity mobile/project selector

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
UAT: `agents.output/uat/4-dashboard-parity-mobile-projects-uat.md`
G9 fix UAT: `agents.output/uat/4-dashboard-parity-mobile-projects-g9-fix2-uat.md`
QA: `agents.output/qa/4-dashboard-parity-mobile-projects-qa.md`, `agents.output/qa/4-dashboard-parity-mobile-projects-g9-fix2-qa.md`
Security: `agents.output/security/4-dashboard-parity-mobile-projects-security-v3.md`
Expected output: `agents.output/devops/4-dashboard-parity-mobile-projects-devops.md`

User approved G9 re-preview after mobile Quality one-card-per-row fix.

Devops objectives:
- Read `rules/pidex-devops/g9-preview-upstream-reachability.md` and include preview reachability evidence (`0.0.0.0:18777`, local/LAN/user URL checks) in deployment doc.
- Preserve unrelated dirty workspace; selectively stage/commit only intended plan files if committing.
- Because post-G9 code changes occurred, ensure targeted test validation evidence exists (quality mobile layout test + typecheck) per post-G9 rule.
- Do not push/tag unless explicitly approved. Use local/held disposition if appropriate.
- Security finding S1 triggered mandatory full retro, so route to pidex-retrospective.

ROUTING context_file must be expected output.
