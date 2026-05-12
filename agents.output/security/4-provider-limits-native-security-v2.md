---
ID: 4
Origin: 4
UUID: 70d50d80
Status: Active
Verdict: REJECTED
---

# Security Review: provider-limits-native-security-v2

## Scope
Targeted Code Review. Second pass. Verify SEC-1 remediation for provider-limits API auth/write controls. No code changes.

## Inputs
- `agents.output/briefs/4-provider-limits-native-security-v2-brief.md`
- `agents.output/security/4-provider-limits-native-security.md`
- `agents.output/implementation/4-provider-limits-native-security-fix.md`
- `dashboard/lib/server/provider-limits-auth.ts`
- `dashboard/lib/server/provider-limits-auth.tdd.test.mjs`
- `dashboard/routes/api/provider-limits.tsx`
- `dashboard/routes/api/provider-limits/profile.tsx`
- `dashboard/routes/api/provider_limits.tsx`
- `dashboard/routes/api/provider_limits/profile.tsx`

## Mode
Targeted Code Review. Pipeline/direct second pass.

## Prior Findings Verification
SEC-1 not resolved. Token + same-origin logic added. Localhost decision uses `new URL(request.url).hostname`, not verified client socket address. With dashboard bound to `0.0.0.0`, direct LAN client can spoof `Host: 127.0.0.1:18777`/`localhost:18777`; framework URL construction commonly derives `request.url` from Host. Guard then treats remote client as local and bypasses token. Write guard can also be bypassed with matching spoofed `Origin`.

## Changed Files Reviewed
- `dashboard/lib/server/provider-limits-auth.ts`: new guard. Weak trust boundary: URL host == client locality.
- `dashboard/lib/server/provider-limits-auth.tdd.test.mjs`: covers non-local URL and cross-origin local write. Missing hostile Host/local URL bypass case and token success cases.
- Four provider-limits API routes: guard wired before GET/POST behavior. Wiring consistent.

## Automated Checks
- `node --experimental-strip-types --test dashboard/lib/server/provider-limits-auth.tdd.test.mjs dashboard/lib/server/limits.tdd.test.mjs` — PASS, 3/3.
- Scoped secret check: `/home/daniel/running-pi/skills/security-patterns/scripts/check-secrets.sh dashboard/lib/server/provider-limits-auth.ts ...` — PASS/no obvious secrets for first scoped file; broad dashboard scan hit dependency test false positives under `node_modules/zod`, ignored.
- Pattern scan: `dangerouslySetInnerHTML|eval|new Function|innerHTML|child_process|exec|spawn|writeFile|readFile` in `dashboard`. No new scoped XSS/command injection in changed provider-limits auth/routes. Existing `limits.ts` fixed state file read/write reviewed from prior pass.

## Fallow Structural Scan
- Command: `npx fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations 2>/dev/null || true`
- Result: 2 issues, same as prior.
- Issues: unlisted `@playwright/test` from `dashboard/tmp-qa-playwright.spec.mjs`; unlisted `playwright` from `dashboard/tmp-qa-mobile-design-limits-smoke.mjs`.
- Security impact: non-blocking. QA temp files only. No circular/boundary issue in provider-limits auth/routes.

## Findings

### SEC-1 — OPEN — High — locality auth bypass via spoofable Host-derived request URL
Evidence:
- `dashboard/package.json`: `dev`/`start` bind `vite --host 0.0.0.0 --port 18777`.
- `dashboard/lib/server/provider-limits-auth.ts`: `isLocal = isLoopbackHost(requestUrl.hostname)` where `requestUrl = new URL(request.url)`.
- `hasValidToken()` required only when `!isLocal`.
- Non-GET same-origin check compares `Origin` to same spoofable `requestUrl`.
Impact:
- Confidentiality: LAN direct client can likely read provider names, usage, costs, reset/status metadata by sending loopback Host header to network-bound server.
- Integrity: same client can likely mutate active profile with spoofed Host + matching Origin, bypassing token and same-origin control.
- Availability/ops: profile tamper can alter operator provider posture.
Required remediation:
1. Do not infer client locality from `request.url`/Host. Use trusted remote address from framework/server context if available, or remove localhost bypass entirely when bound beyond loopback.
2. Prefer secure default: bind dashboard to `127.0.0.1` unless explicit opt-in, or require token for all provider-limits API access when `Host` not trusted.
3. For writes, require unspoofable local operator proof: bearer/local token or CSRF token tied to trusted session. Same-origin Host/Origin alone insufficient for direct clients.
4. Add regression tests for Host-spoof/local-URL bypass and cross-origin/write token behavior.

MANDATORY-RETRO-TRIGGER: security finding; plan=4; uuid=70d50d80; slug=provider-limits-native; occurred_at=2026-05-12; evidence=agents.output/security/4-provider-limits-native-security-v2.md#SEC-1; Retro Mode upgraded to full.

## Positive Security Practices
- Guard wired consistently across hyphen/underscore and profile/root provider-limits routes.
- Token supports bearer and dedicated headers; token sourced from env, not hardcoded.
- Profile allowlist remains in `setProfile()`; arbitrary profile names rejected.
- JSON parse failures degrade to empty object; no crash path seen in POST handlers.
- JSON responses use `Cache-Control: no-store`.

## Verdict
REJECTED. SEC-1 remains open. Remediation clear; return to implementer.

## Routing
<!-- ROUTING -->
verdict: REJECTED
route_to: pidex-implementer
context_file: agents.output/security/4-provider-limits-native-security-v2.md
gate: G5
reason: SEC-1 still bypassable because locality check trusts spoofable request URL/Host while dashboard binds 0.0.0.0.
<!-- /ROUTING -->
