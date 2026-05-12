---
ID: 4
Origin: 4
UUID: 70d50d80
Status: Active
Verdict: APPROVED_WITH_CONTROLS
---

# Security Review: provider-limits-native

## Mode
Targeted Code Review. Pipeline step. Scope bounded to provider-limits probe/API/UI/profile mutation.

## Scope
Reviewed:
- `scripts/provider-limits/probe.py`
- `scripts/profile/recommend.sh`
- `scripts/profile/use.sh`
- `dashboard/lib/server/limits.ts`
- `dashboard/routes/api/provider-limits.tsx`
- `dashboard/routes/api/provider-limits/profile.tsx`
- `dashboard/routes/api/provider_limits.tsx`
- `dashboard/routes/api/provider_limits/profile.tsx`
- `dashboard/routes/limits.tsx`
- focused tests/docs from brief

## Inputs
- `agents.output/briefs/4-provider-limits-native-security-brief.md`
- `rules/pidex-security/fallow-structural-signal.md`
- `agents.output/planning/4-provider-limits-native-plan.md`
- `agents.output/code-review/4-provider-limits-native-code-review-v2.md`
- `agents.output/implementation/4-provider-limits-native-implementation.md`
- `agents.output/implementation/4-provider-limits-native-implementation-fix1.md`

## Fallow Structural Signal
- Command: `npx fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations 2>/dev/null || true`
- Result: 2 issues. `unlisted_dependencies`: `@playwright/test` from `dashboard/tmp-qa-playwright.spec.mjs`; `playwright` from `dashboard/tmp-qa-mobile-design-limits-smoke.mjs`.
- Security impact: non-blocking. QA temp files only. No auth/network boundary cycle or hidden provider-limits attack surface found.

## Automated Checks
- `python3 scripts/provider-limits/test_probe_tdd.py` — PASS.
- `node --experimental-strip-types --test dashboard/lib/server/limits.tdd.test.mjs` — PASS.
- `/home/daniel/running-claude/skills/security-patterns/scripts/check-secrets.sh .` — PASS/no output.
- Pattern scan reviewed `recommended_profile`, `running-pi`, XSS sinks, eval/exec/subprocess, file read/write in scoped paths.

## Findings

### SEC-1 — OPEN — High — network-exposed unauthenticated provider-limit API leaks usage and allows profile mutation
Evidence:
- `dashboard/package.json` runs dev/start with `vite --host 0.0.0.0 --port 18777`.
- `dashboard/routes/api/provider-limits.tsx` exposes `GET` records and `POST` `setProfile(profile)` without auth, token, origin check, or CSRF control.
- `dashboard/routes/api/provider_limits.tsx` duplicate compatibility route same behavior.
- `dashboard/routes/api/provider-limits/profile.tsx` and underscore route expose active profile/profile list and POST mutation.
Impact:
- Confidentiality: LAN visitor can read provider names, usage, costs, reset/status metadata.
- Integrity: LAN visitor or malicious page can attempt state mutation via profile endpoints. Cross-origin read blocked by browser CORS, but direct LAN clients and form/URL-triggered writes remain feasible when service bound on `0.0.0.0`.
- Availability/ops: unwanted profile switch can alter operator behavior and downstream limits posture.
Required controls:
1. Default dashboard bind to loopback (`127.0.0.1`) OR require explicit opt-in for `0.0.0.0` with warning.
2. Add provider-limits API protection before network exposure: bearer/local token, session auth, or signed operator action.
3. For mutation endpoints, reject cross-origin writes: validate `Origin`/`Host` and require CSRF token or non-browser local token.
4. Keep profile allowlist validation already present; add audit/log line for profile changes if dashboard keeps mutation.

MANDATORY-RETRO-TRIGGER: security finding; plan=4; uuid=70d50d80; slug=provider-limits-native; occurred_at=2026-05-12; evidence=agents.output/security/4-provider-limits-native-security.md#SEC-1; Retro Mode upgraded to full.

## Positive Controls
- Path traversal: no user-controlled filesystem path in scoped probe/API. `STATE_FILE`, `PROFILE_DIR`, native source fixed via repo root constants.
- Profile mutation validation: `setProfile()` accepts only filenames from `config/profiles/*.json`; unknown profile rejected.
- XSS: `/limits` renders record fields as React text nodes; no `dangerouslySetInnerHTML` in scoped UI.
- Command injection: scoped code has no shell execution from API/UI input.
- Recommendation leakage removed: active surfaces pop/remove `recommended_profile`; tests assert absence.
- Malformed JSON tolerance: probe/API catch parse errors and degrade to empty/default payloads.

## Risk Assessment
SEC-1 blocks blind promotion to QA as security-approved release path. Code behavior mostly sound for trusted localhost-only use. Package scripts expose dashboard on all interfaces, making unauthenticated API read/write material.

Low residual notes, non-blocking after SEC-1 controls:
- `readState()` reads whole `latest.json` without size cap. Local file-only DoS risk. Consider small max-size guard before `JSON.parse`.
- `setProfile()` writes only `latest.json`; probe CLI writes `active-profile.json` too. Integrity consistency risk, not direct security blocker.

## Verdict
APPROVED_WITH_CONTROLS. Implement SEC-1 controls before QA/release gate.

## Routing
<!-- ROUTING
verdict: APPROVED_WITH_CONTROLS
route_to: pidex-implementer
reason: SEC-1 requires loopback/auth/CSRF controls for network-exposed provider-limits read/write API.
gate: none
context_file: agents.output/security/4-provider-limits-native-security.md
-->
