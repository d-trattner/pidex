---
ID: 4
Origin: 4
UUID: 70d50d80
Status: Active
Verdict: APPROVED
---

# Security Review: provider-limits-native-security-v5

## Scope
Targeted Code Review. Fifth pass. Verify SEC-3 dependency remediation. Confirm SEC-1/SEC-2 remain resolved. No production code changes.

Reviewed:
- `agents.output/briefs/4-provider-limits-native-security-v5-brief.md`
- `agents.output/security/4-provider-limits-native-security-v4.md`
- `agents.output/implementation/4-provider-limits-native-security-fix4.md`
- `dashboard/package.json`
- `dashboard/package-lock.json`
- `dashboard/lib/server/provider-limits-auth.ts`
- provider-limits route auth call sites

## Inputs
Brief asks:
- `@tanstack/react-start` pinned/downgraded to non-affected available `1.167.65`.
- `dashboard/package-lock.json` regenerated.
- `npm -C dashboard audit --omit=dev --json` clean.
- SEC-1/SEC-2 remain resolved.
- Run/document Fallow.

Process rule file unavailable:
- `<running-pi-root>/rules/pidex-security/index.md` — ENOENT.
- No `agents.wiki.*/rules/pidex-security.md` found.

Security skill loaded:
- `<running-pi-root>/skills/security-patterns/SKILL.md`.

## Mode
Targeted Code Review. Direct mode. Pipeline-style fixed pass.

## Findings Status
| Finding | Status | Evidence |
|---|---|---|
| SEC-1 provider-limits auth bypass | VERIFIED RESOLVED | Auth tests pass; route call sites still enforce `authorizeProviderLimitsRequest()` before GET/POST. |
| SEC-2 malformed package JSON | CLOSED | `dashboard/package.json` valid; typecheck/build pass. |
| SEC-3 critical malware advisory in `@tanstack/react-start@1.167.71` | CLOSED | Direct dep + lock now `1.167.65`; prod audit clean. |

## SEC-1 Verification
Resolved.

Evidence:
- `authorizeProviderLimitsRequest()` still requires token when public-bind env true or request URL non-loopback.
- Public bind + loopback-host spoof without token denied by test.
- Public bind + bearer token allowed by test.
- Public bind + bearer token + cross-origin write denied by test.
- Non-local read without token denied by test.
- Local write same-origin allowed; cross-origin denied by test.
- Hyphen + underscore provider-limits routes still call `authorizeProviderLimitsRequest()` before GET/POST work.

Command:
```sh
node --experimental-strip-types --test dashboard/lib/server/provider-limits-auth.tdd.test.mjs dashboard/lib/server/limits.tdd.test.mjs
```
Result: PASS, 6/6.

## SEC-2 Verification
Closed.

Evidence:
- `dashboard/package.json` parses via npm commands.
- Typecheck pass.
- Build pass.

Commands:
```sh
npm -C dashboard run typecheck
npm -C dashboard run build
```
Results:
- typecheck — PASS.
- build — PASS.

## SEC-3 Verification
Closed.

Evidence:
- `dashboard/package.json` dependency: `"@tanstack/react-start": "1.167.65"`.
- `dashboard/package-lock.json` package dependency: `"@tanstack/react-start": "1.167.65"`.
- Lock entry: `node_modules/@tanstack/react-start` version `1.167.65`, registry tarball `react-start-1.167.65.tgz`.
- Production dependency audit clean.

Command:
```sh
npm -C dashboard audit --omit=dev --json
```
Result:
```json
{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}}
```

Impact after fix:
- Critical direct malware advisory no longer present in prod audit output.
- Direct affected version `1.167.71` removed from manifest + lock.

## Fallow Signal
Command:
```sh
cd dashboard && npx fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations
```
Result:
- exit 1.
- `total_issues`: 1.
- `unlisted_dependencies`: 1.
- `unresolved_imports`: 0.
- `circular_dependencies`: 0.
- `boundary_violations`: 0.

Issue:
- `playwright` imported from `tmp-qa-mobile-design-limits-smoke.mjs`, not listed in `dashboard/package.json`.

Security impact:
- Temp QA script dependency hygiene. Not runtime provider-limits auth path. Non-blocking for this pass.

## Tests / Commands
```sh
npm -C dashboard audit --omit=dev --json
node --experimental-strip-types --test dashboard/lib/server/provider-limits-auth.tdd.test.mjs dashboard/lib/server/limits.tdd.test.mjs
npm -C dashboard run typecheck
npm -C dashboard run build
cd dashboard && npx fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations
```

Results:
- prod audit — PASS, 0 vulns.
- auth/limits tests — PASS, 6/6.
- typecheck — PASS.
- build — PASS.
- fallow — non-blocking QA temp script unlisted dependency only.

## Positive Controls
- Provider-limits auth uses deny-by-default token requirement for non-local or public-bind mode.
- Cross-origin writes denied.
- Route handlers enforce auth before reads/writes.
- Dashboard scripts default loopback bind.
- Dependency pin avoids affected direct package version and lock captures exact tarball integrity.
- Prod dependency audit clean.

## Risks / Gaps
- Temp QA file imports unlisted `playwright`; hygiene cleanup recommended outside security gate.
- Operational footgun remains: manual Vite bind to public host without `PIDEX_DASHBOARD_PUBLIC_BIND=1` unsupported. Document operator path if public dashboard ever supported.

## Verdict
APPROVED.

SEC-1 verified resolved. SEC-2 closed. SEC-3 closed. No blocking security findings remain for QA handoff.

## Routing
<!-- ROUTING
verdict: APPROVED
route_to: pidex-qa
context_file: agents.output/security/4-provider-limits-native-security-v5.md
gate: none
reason: SEC-3 remediated with @tanstack/react-start 1.167.65 and clean prod audit; SEC-1/SEC-2 remain resolved.
-->
