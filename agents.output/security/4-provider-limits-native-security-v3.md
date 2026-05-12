---
ID: 4
Origin: 4
UUID: 70d50d80
Status: Active
Verdict: REJECTED
---

# Security Review: provider-limits-native-security-v3

## Scope
Targeted Code Review. Third pass. Verify SEC-1 fix2. No code changes.

Reviewed:
- `agents.output/briefs/4-provider-limits-native-security-v3-brief.md`
- `agents.output/security/4-provider-limits-native-security-v2.md`
- `agents.output/implementation/4-provider-limits-native-security-fix2.md`
- `dashboard/lib/server/provider-limits-auth.ts`
- `dashboard/lib/server/provider-limits-auth.tdd.test.mjs`
- `dashboard/package.json`
- `dashboard/start.sh`
- provider-limits API routes, hyphen + underscore variants

## Inputs
Primary brief requests SEC-1 verification:
- Dashboard defaults bind loopback, not `0.0.0.0`.
- Public bind forces provider-limits token and denies spoofed loopback URL/Host without token.
- Write controls remain adequate.
- Regression tests cover spoofed loopback denial/token allow/cross-origin write denial.

## Mode
Targeted Code Review. Direct mode. Pipeline-style scope from brief.

## Summary
SEC-1 auth bypass logic fixed in code. Public-bind token gate blocks Host-spoof/local URL bypass when `PIDEX_DASHBOARD_PUBLIC_BIND=1`. `start.sh` defaults loopback and sets public-bind flag for non-loopback host.

Cannot approve pass. `dashboard/package.json` malformed after host script edit. `npm run dev/start/build/typecheck` cannot parse package. Package-script secure default cannot be validated or used. Fix clear.

## Findings

### SEC-2 — OPEN — Medium — malformed package.json breaks dashboard scripts and secure default validation
Evidence:
- `dashboard/package.json` scripts object missing commas after `dev` and `start` entries.
- Command: `python3 -m json.tool dashboard/package.json >/tmp/dashboard-package-json.ok`
- Result: `Expecting ',' delimiter: line 9 column 5 (char 243)`.
Impact:
- Availability: dashboard npm scripts fail before start/build/typecheck.
- Security validation: package-level loopback default cannot be consumed by npm; public-bind behavior via package scripts not verifiable.
Required remediation:
1. Add missing commas in `dashboard/package.json` scripts.
2. Re-run package parse plus `npm -C dashboard run build` or equivalent.
3. Re-run security v3 smoke after fix.

## SEC-1 Verification
Status: RESOLVED in auth/start logic; blocked by malformed package artifact.

Evidence:
- `dashboard/lib/server/provider-limits-auth.ts`: `requiresToken = isPublicBindEnabled() || !isLocal`.
- `isPublicBindEnabled()` accepts `1|true|yes` from `PIDEX_DASHBOARD_PUBLIC_BIND`.
- Public bind + spoofed loopback request without token returns 403.
- Public bind + valid bearer token allowed.
- Public bind + valid token + cross-origin write denied.
- `dashboard/start.sh`: default `HOST="127.0.0.1"`; exports `PIDEX_DASHBOARD_PUBLIC_BIND=1` for non-loopback host, `0` for loopback.
- Provider-limits API routes call `authorizeProviderLimitsRequest()` before GET/POST work.

Residual SEC-1 note:
- Localhost bypass still trusts Host-derived URL when public-bind flag absent. Acceptable only because default bind is loopback and public-bind flag is set by `start.sh`. Operators starting Vite manually on `0.0.0.0` without env flag can re-open risk. Document operational control or enforce token by bind detection if framework exposes peer address later.

## Positive Controls
- Token sourced from env: `PIDEX_PROVIDER_LIMITS_TOKEN` or `PROVIDER_LIMITS_TOKEN`; no hardcoded secret.
- Bearer and dedicated token headers supported.
- Cross-origin writes rejected when `Origin` does not match request URL.
- Profile mutation still constrained by `setProfile()` allowlist from config profiles.
- JSON response cache-control remains `no-store` in response helper from prior review.

## Automated Checks
- `node --experimental-strip-types --test dashboard/lib/server/provider-limits-auth.tdd.test.mjs dashboard/lib/server/limits.tdd.test.mjs` — PASS, 6/6.
- `/home/daniel/running-pi/skills/security-patterns/scripts/check-secrets.sh dashboard/lib/server/provider-limits-auth.ts ... dashboard/package.json` — PASS/no obvious secrets for scoped files.
- Pattern scan: `dangerouslySetInnerHTML|eval|new Function|innerHTML|child_process|exec|spawn|writeFile|readFile` in `dashboard`. No new scoped XSS/command injection in provider-limits auth/routes. Existing file IO in limits reviewed in prior pass.
- `python3 -m json.tool dashboard/package.json` — FAIL, malformed JSON.

## Fallow Structural Scan
Command:
```sh
npx fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations 2>/tmp/fallow-stderr.txt || true
```
Result:
- 11 issues, all `unlisted_dependencies`; no circular dependencies; no boundary violations.
- Expanded from prior 2 because `dashboard/package.json` malformed, so Fallow cannot use dependency declarations correctly.
Security impact:
- Supports SEC-2. Dependency graph signal degraded by invalid package metadata. No provider-limits-specific circular/boundary issue shown.

## Residual Risk
- Manual public bind outside `start.sh` without `PIDEX_DASHBOARD_PUBLIC_BIND=1` remains risky. Non-blocking if documented as unsupported path or follow-up hardening.
- SEC-2 blocks approval until package metadata valid.

## Verdict
REJECTED. SEC-1 fix logic sound, but malformed `dashboard/package.json` blocks consumable secure default and dashboard script validation.

## Routing
<!-- ROUTING -->
verdict: REJECTED
route_to: pidex-implementer
context_file: agents.output/security/4-provider-limits-native-security-v3.md
gate: none
reason: SEC-1 auth logic resolved, but malformed dashboard/package.json prevents package-script secure default validation; fix commas and rerun.
<!-- /ROUTING -->
