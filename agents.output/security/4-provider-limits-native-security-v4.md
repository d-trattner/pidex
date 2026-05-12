---
ID: 4
Origin: 4
UUID: 70d50d80
Status: Active
Verdict: REJECTED
---

# Security Review: provider-limits-native-security-v4

## Scope
Targeted Code Review. Fourth pass. Verify SEC-1 final status after package JSON comma fix. No code changes.

Reviewed:
- `agents.output/briefs/4-provider-limits-native-security-v4-brief.md`
- `agents.output/security/4-provider-limits-native-security-v3.md`
- `agents.output/implementation/4-provider-limits-native-security-fix3.md`
- `dashboard/package.json`
- `dashboard/start.sh`
- `dashboard/lib/server/provider-limits-auth.ts`
- `dashboard/lib/server/provider-limits-auth.tdd.test.mjs`
- `dashboard/lib/server/limits.tdd.test.mjs`
- provider-limits routes, hyphen + underscore variants

## Inputs
Brief asks final SEC-1 verification after package JSON comma fix. Run targeted checks and Fallow.

Process rule file unavailable:
- `/home/daniel/running-pi/rules/pidex-security/index.md` — ENOENT.
- No `agents.wiki.*/rules/pidex-security.md` found.

Security skill unavailable in repo search:
- `security-patterns*` not found under cwd.

## Mode
Targeted Code Review. Direct mode. Pipeline-style scope from brief.

## Prior Findings
- SEC-1 auth bypass: resolved in v3 code logic, blocked only by malformed package artifact.
- SEC-2 malformed `dashboard/package.json`: open in v3, fixed in fix3.

## Verification
SEC-2 fixed.
- `dashboard/package.json` now valid JSON.
- `dev` script: `vite --host 127.0.0.1 --port 18777`.
- `start` script: `vite preview --host 127.0.0.1 --port 18777`.
- `npm -C dashboard run typecheck` — PASS.
- `npm -C dashboard run build` — PASS.

SEC-1 resolved.
- `authorizeProviderLimitsRequest()` requires token when `PIDEX_DASHBOARD_PUBLIC_BIND` true or request URL non-loopback.
- Public bind + spoofed loopback URL without token denied by test.
- Public bind + bearer token allowed by test.
- Public bind + bearer token + cross-origin write denied by test.
- Non-local read without token denied by test.
- Local write with same-origin origin allowed; cross-origin origin denied by test.
- `dashboard/start.sh` default host `127.0.0.1`.
- `dashboard/start.sh` sets `PIDEX_DASHBOARD_PUBLIC_BIND=1` for non-loopback host, `0` for loopback host.
- Hyphen and underscore provider-limits routes call `authorizeProviderLimitsRequest()` before GET/POST work.

Commands:
```sh
node -e "JSON.parse(require('fs').readFileSync('dashboard/package.json','utf8')); console.log('dashboard package json ok')"
node --experimental-strip-types --test dashboard/lib/server/provider-limits-auth.tdd.test.mjs dashboard/lib/server/limits.tdd.test.mjs
npm -C dashboard run typecheck
npm -C dashboard run build
```
Results:
- package parse — PASS.
- auth/limits tests — PASS, 6/6.
- typecheck — PASS.
- build — PASS.

## Fallow Scan
Command:
```sh
cd dashboard && npx fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations
```
Result:
- exit 1.
- `total_issues`: 2.
- `unlisted_dependencies`: 2.
- `circular_dependencies`: 0.
- `boundary_violations`: 0.
- `unresolved_imports`: 0.

Issues:
- `@playwright/test` imported from `dashboard/tmp-qa-playwright.spec.mjs`, not listed.
- `playwright` imported from `dashboard/tmp-qa-mobile-design-limits-smoke.mjs`, not listed.

Security impact:
- Test-only temp QA dependency hygiene issue. Not provider-limits auth bypass. Non-blocking for SEC-1.

## Automated Checks
Secret scan:
```sh
/home/daniel/running-pi/skills/security-patterns/scripts/check-secrets.sh dashboard/lib/server/provider-limits-auth.ts ...
```
Result:
- PASS/no obvious secrets for first scoped file. Script accepted only first path in output.

Pattern scan:
```sh
grep -R "dangerouslySetInnerHTML|eval\(|new Function|innerHTML|child_process|exec\(|spawn\(|writeFile|readFile" dashboard
```
Result:
- No provider-limits auth/routes XSS or command execution pattern.
- Existing file IO in `limits.ts` previously reviewed; `setProfile()` constrains profile via config allowlist.

Dependency audit:
```sh
npm -C dashboard audit --omit=dev --json
```
Result:
- FAIL. 1 critical production vulnerability.
- Direct dependency `@tanstack/react-start@1.167.71` flagged as malware.
- Advisories: GHSA-7cm2-482j-9rxq, GHSA-g7cv-rxg3-hmpx.
- CWE-506. CVSS 9.6 for GHSA-g7cv-rxg3-hmpx.
- Audit says `fixAvailable: false` for installed version.

## Findings

### SEC-1 — VERIFIED RESOLVED — High — provider-limits auth bypass
Evidence:
- Tests pass for non-local denial, public bind loopback-spoof denial, token allow, cross-origin write denial.
- Package scripts parse and default loopback.
- Start script exports public-bind flag on non-loopback host.

Residual operational note:
- Manual Vite bind to `0.0.0.0` outside `start.sh` without `PIDEX_DASHBOARD_PUBLIC_BIND=1` can re-open risk. Treat as unsupported operator path or document required env.

### SEC-2 — CLOSED — Medium — malformed package JSON
Evidence:
- JSON parse passes.
- `npm -C dashboard run typecheck` passes.
- `npm -C dashboard run build` passes.

### SEC-3 — OPEN — Critical — production dependency flagged as malware
Evidence:
- `npm -C dashboard audit --omit=dev --json` reports critical direct dependency `@tanstack/react-start@1.167.71`.
- Advisories: GHSA-7cm2-482j-9rxq, GHSA-g7cv-rxg3-hmpx.
- Description: malware in `@tanstack/*` packages exfiltrates cloud credentials, GitHub tokens, SSH keys.

Impact:
- Confidentiality: credentials and keys may be exposed during install/build/runtime.
- Integrity: compromised supply chain package can execute attacker code.
- Availability: incident response may require cache purge/reinstall/rotation.

Required remediation:
1. Remove or replace affected `@tanstack/react-start@1.167.71` with non-affected version per upstream advisory.
2. Regenerate `dashboard/package-lock.json` from clean registry/cache.
3. Reinstall from clean environment. Do not trust existing install cache.
4. Rotate any credentials present on machines that installed/built affected package during exposure window.
5. Re-run `npm -C dashboard audit --omit=dev --json`, build, typecheck, SEC-1 tests.

MANDATORY-RETRO-TRIGGER: security finding; plan=4; uuid=70d50d80; slug=provider-limits-native; occurred_at=2026-05-12; evidence=agents.output/security/4-provider-limits-native-security-v4.md#SEC-3; Retro Mode upgraded to full.

## Positive Controls
- Provider-limits auth now has defense-in-depth for public bind: env gate + token.
- Package scripts default loopback.
- Start script marks public bind explicitly.
- Token sourced from env; no hardcoded secret in scoped auth file.
- Cross-origin writes denied.
- Profile mutation constrained by server-side config allowlist.
- Response helper uses no-store per prior review.

## Verdict
REJECTED.

SEC-1 verified resolved. SEC-2 closed. Cannot approve release path because production dependency audit reports critical direct malware advisory for `@tanstack/react-start@1.167.71`.

## Routing
<!-- ROUTING -->
verdict: REJECTED
route_to: pidex-implementer
context_file: agents.output/security/4-provider-limits-native-security-v4.md
gate: G5
reason: SEC-1 resolved and package JSON fixed, but npm audit reports critical direct malware advisory in @tanstack/react-start@1.167.71; remediate dependency before QA.
<!-- /ROUTING -->
