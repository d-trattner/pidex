# Security brief: dashboard parity mobile/project selector

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
Code review approval: `agents.output/code-review/4-dashboard-parity-mobile-projects-code-review-v3.md`
Implementation docs:
- `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation.md`
- `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation-continuation.md`
- `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation-fix1.md`
- `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation-fix2.md`
Expected output: `agents.output/security/4-dashboard-parity-mobile-projects-security.md`

Security review scope:
- URL query project selector and project filtering on APIs.
- Token pagination page params.
- Live API project filtering.
- Dashboard UI renders project names/metrics.

Check SQL injection/path injection, XSS, unsafe query construction, auth regressions, denial-of-service from unbounded page/limit, and dependency audit if feasible. Run/document Fallow per `rules/pidex-security/fallow-structural-signal.md`.

Do not modify files. ROUTING context_file must be expected output and route to pidex-qa if approved.
