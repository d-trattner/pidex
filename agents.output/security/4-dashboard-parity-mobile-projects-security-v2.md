---
ID: 4
Origin: 4
UUID: 5098e241
Status: Active
Verdict: APPROVED_WITH_CONTROLS
---

## Scope
- Mode: Targeted Code Review, second pass.
- Objective: verify S1/S2 remediation, final status, Fallow signal.
- Files reviewed: `dashboard/package.json`, `dashboard/package-lock.json`, `dashboard/routes/api/token-consumption.tsx`, `dashboard/routes/api/token_consumption.tsx`, project query/filter/API surfaces.

## Inputs
- Brief: `agents.output/briefs/4-dashboard-parity-mobile-projects-security-v2-brief.md`.
- Prior security: `agents.output/security/4-dashboard-parity-mobile-projects-security.md`.
- Security fix doc: `agents.output/implementation/4-dashboard-parity-mobile-projects-security-fix.md`.
- Global rule path missing: `<running-pi-root>/rules/pidex-security/index.md` ENOENT.
- Project security wiki rule: none found.
- Skill loaded: `<home>/running-claude/skills/security-patterns/SKILL.md`, JS reference.

## Mode
- Targeted Code Review. Pipeline second pass. No clarification gate.

## Findings Review
| ID | Prior issue | Status | Evidence |
|---|---|---|---|
| S1 | Critical malware package `@tanstack/router-plugin@1.167.41` | VERIFIED_REMEDIATED | `package.json` pins `1.167.35`; lock has `1.167.35`; `npm ls` shows `1.167.35`; `npm audit` 0 vulns; no `1.167.41` in package files. |
| S2 | Raw token API error string | PARTIAL | `/api/token-consumption` generic catch fixed. `/api/token_consumption` alias still returns `error.message`. |

## Fallow Evidence
- Command: `cd dashboard && npx fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations 2>/tmp/pidex-fallow-stderr.txt || true`.
- Result: PASS_WITH_NOTE. `total_issues=1`.
- Finding: unlisted dependency `playwright` imported from `tmp-qa-mobile-design-limits-smoke.mjs:1`.
- Security impact: support signal only. QA temp dependency drift; no reviewed auth/query weakness.

## Security Checks
| Check | Result | Evidence |
|---|---|---|
| Dependency audit | PASS | `npm -C dashboard audit --audit-level=moderate --json`: 0 total vulns. |
| Installed package | PASS | `npm -C dashboard ls @tanstack/router-plugin --depth=0`: `@tanstack/router-plugin@1.167.35`. |
| Compromised version grep | PASS | No `1.167.41`, `GHSA-wp6c`, `GHSA-g7cv` in package files. |
| Error sanitization test | PASS_LIMITED | `node --test dashboard/tests/token-consumption-error-sanitization.tdd.test.mjs`: pass. Test covers dash route only. |
| Typecheck | PASS | `npm -C dashboard run typecheck`: pass. |
| Query/project SQL injection | PASS | `parseProjectFilter()` returns fixed SQL fragment + params; callers pass params arrays. |
| XSS reviewed UI | PASS | No `dangerouslySetInnerHTML`/`innerHTML` hits in reviewed routes/components/lib; React text rendering used. |
| Token endpoint alias | FAIL_CONTROL | `dashboard/routes/api/token_consumption.tsx` catch returns `String(error.message...)`. |

## Positive Controls
- S1 supply-chain blocker fixed; audit clean.
- Dash token endpoint fixed with generic 500 response.
- Client project query uses `URLSearchParams`.
- Server project filter parameterized. Placeholder project values collapse to all-project mode.
- Page parsing clamps negative values.

## Verdict
- `APPROVED_WITH_CONTROLS`.
- S1 closed. S2 incomplete only on underscore alias `/api/token_consumption`.
- Control required before final QA/release: sanitize alias catch to same generic response and extend test to cover both `token-consumption.tsx` and `token_consumption.tsx`.

## Routing
<!-- ROUTING
verdict: APPROVED_WITH_CONTROLS
route_to: pidex-implementer
reason: S1 verified clean; S2 remains in /api/token_consumption alias; apply generic error control then re-review.
gate: none
context_file: agents.output/security/4-dashboard-parity-mobile-projects-security-v2.md
-->
