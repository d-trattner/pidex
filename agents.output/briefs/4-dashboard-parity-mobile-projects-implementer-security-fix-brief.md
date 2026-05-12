# Implementer security fix brief

Project cwd: `/home/daniel/pidex`
Security review: `agents.output/security/4-dashboard-parity-mobile-projects-security.md`
Expected output: `agents.output/implementation/4-dashboard-parity-mobile-projects-security-fix.md`

Fix security blockers:
- S1: `@tanstack/router-plugin@1.167.41` critical malware advisory. Pin/regenerate to safe available version; security found latest `1.167.35`. Regenerate lockfile. Do not use compromised version.
- S2: `dashboard/routes/api/token-consumption.tsx` leaks raw error message; return generic error.

Run: `npm -C dashboard audit --audit-level=moderate --json`, focused tests, typecheck/build as feasible. Preserve unrelated changes.

ROUTING context_file must be expected output; route to pidex-security.
