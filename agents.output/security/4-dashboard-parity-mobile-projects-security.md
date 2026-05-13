---
ID: 4
Origin: 4
UUID: 5098e241
Status: Active
Verdict: BLOCKED_PENDING_REMEDIATION
---

## Scope
- Mode: Targeted Code Review. Direct-mode pipeline. Scope from brief.
- Reviewed changed dashboard JS/TS surfaces: project query selector/filtering, token page params, live API project filter, Quality/Tokens UI render of project data.
- Dependency audit run because feasible.

## Inputs
- Brief: `agents.output/briefs/4-dashboard-parity-mobile-projects-security-brief.md`
- Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
- Code review: `agents.output/code-review/4-dashboard-parity-mobile-projects-code-review-v3.md`
- Implementation: `agents.output/implementation/4-dashboard-parity-mobile-projects-implementation.md`
- Implementation continuation/fixes: listed in brief.
- Fallow rule: `rules/pidex-security/fallow-structural-signal.md`
- Global rule path missing: `<running-pi-root>/rules/pidex-security/index.md` ENOENT.
- Project-specific security wiki rule: none found.
- `security-patterns` skill path not found in repo.

## Changed Files Reviewed
- `dashboard/lib/client/project-query.ts`
- `dashboard/components/navigation/global-nav.tsx`
- `dashboard/routes/tokens.tsx`
- `dashboard/routes/quality.tsx`
- `dashboard/routes/api/live.tsx`
- `dashboard/routes/api/token-consumption.tsx`
- `dashboard/lib/server/filters.ts`
- `dashboard/lib/server/api.ts`
- `dashboard/lib/server/token-pagination.ts`
- `dashboard/package.json`, `dashboard/package-lock.json`

## Security Checks
| Area | Result | Evidence |
|---|---|---|
| SQL injection | PASS | `parseProjectFilter()` returns fixed SQL fragment plus `?` params; callers pass params arrays. |
| Path injection | PASS | Project query not used for filesystem path in reviewed surfaces. |
| XSS | PASS | React renders project/data values as text; no `dangerouslySetInnerHTML` in reviewed UI. |
| Query construction | PASS | Client uses `URLSearchParams`; API parses with `URLSearchParams`. |
| Page/limit DoS | PASS_WITH_NOTE | Token `page` coerced non-negative; huge page yields empty window. Token API still groups all matching rows before pagination; existing analytics pattern, not new blocker. |
| Auth regression | PASS_WITH_SCOPE | Dashboard analytics endpoints appear unauthenticated before/after; no new bypass in project selector scope. |
| Error leakage | FAIL_NONBLOCKING_EXISTING | `token-consumption.tsx` returns raw exception string on 500. Existing pattern in several API routes. Plan wanted generic errors. Not release blocker versus critical dependency, but should fix with same remediation. |

## Fallow Structural Signal
- Command: `cd dashboard && npx fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations 2>/dev/null || true`
- Outcome: PASS_WITH_FINDING. `total_issues=1`.
- Finding: unlisted dependency `playwright` imported from `tmp-qa-mobile-design-limits-smoke.mjs`.
- Security impact: supporting signal only. Indicates transient QA smoke file/dependency drift, not auth/query vulnerability. Follow-up: remove temp file or declare/ignore dependency if intentional.

## Automated Checks
- Command: `cd dashboard && npm audit --audit-level=moderate --json`
- Outcome: FAIL. 1 critical vulnerability.
- Evidence: `@tanstack/router-plugin@1.167.41` direct devDependency flagged:
  - GHSA-wp6c-87p2-r5xw: Malware in `@tanstack/router-plugin`, critical, CWE-506.
  - GHSA-g7cv-rxg3-hmpx: Malware in `@tanstack/*` packages exfiltrates cloud credentials, GitHub tokens, SSH keys, critical, CVSS 9.6.
- `npm view @tanstack/router-plugin version` shows latest available `1.167.35`; compromised `1.167.41` still in lock/install.

## Findings

### S1 — Critical supply-chain malware package present — OPEN
- Severity: CRITICAL.
- Component: `dashboard/package.json` / `dashboard/package-lock.json` / installed `node_modules/@tanstack/router-plugin`.
- Evidence: `npm audit` reports direct devDependency `@tanstack/router-plugin@1.167.41` malware, credential/token/SSH-key exfiltration advisories.
- Impact: Build/dev environment compromise possible. Secrets exposed if install/build ran with credentials present. Integrity of generated route/build artifacts cannot be trusted until clean reinstall.
- Required remediation:
  1. Stop using current `dashboard/node_modules` and any artifacts built after install of `@tanstack/router-plugin@1.167.41`.
  2. Remove compromised version from `package.json` and lockfile. Pin known non-flagged version, e.g. `@tanstack/router-plugin@1.167.35`, or vendor-confirmed safe replacement.
  3. Delete `dashboard/node_modules` and reinstall from clean lockfile.
  4. Re-run `npm audit --audit-level=moderate`, typecheck, build, focused tests.
  5. If secrets/tokens existed in environment during install/build, rotate affected GitHub/cloud/SSH credentials per incident policy.
- Blocker: yes.

### S2 — Raw API error string returned from token endpoint — OPEN
- Severity: LOW/MEDIUM.
- Component: `dashboard/routes/api/token-consumption.tsx`.
- Evidence: catch block returns `errorResponse(String(error instanceof Error ? error.message : 'token consumption failed'), 500)`.
- Impact: DB/internal exception text can leak in API response. Plan route security contract wanted generic errors.
- Required remediation: log server-side if needed; return generic `token consumption failed` or `dashboard API error` to client. Consider same pattern in chart endpoints separately.
- Blocker: no, unless touched during dependency remediation.

## Positive Security Notes
- Project filter uses parameterized SQL params, not raw interpolation of URL value.
- Placeholder project values (`all`, `all-projects`, `*`) collapse to all-project mode.
- Client query helpers trim project and reset page/page_week/page_month on project switch.
- React text rendering avoids obvious project-name XSS sink.
- API JSON responses use `Cache-Control: no-store`.

## Verdict
- `BLOCKED_PENDING_REMEDIATION` due critical malware advisory in direct devDependency.
- Query/project implementation itself acceptable after dependency remediation and generic error hardening.

MANDATORY-RETRO-TRIGGER: security finding; plan=4; uuid=5098e241; slug=dashboard-parity-mobile-projects; occurred_at=2026-05-12; evidence=agents.output/security/4-dashboard-parity-mobile-projects-security.md#S1; Retro Mode upgraded to full.

## Routing
<!-- ROUTING
verdict: BLOCKED_PENDING_REMEDIATION
route_to: pidex-implementer
reason: Critical malware advisory in @tanstack/router-plugin@1.167.41; remediate lock/dependency and rotate secrets if exposed.
gate: G5
context_file: agents.output/security/4-dashboard-parity-mobile-projects-security.md
-->
