---
ID: dashboard-mobile-pilan
Origin: <pidex-root>/agents.output/planning/dashboard-mobile-pilan-brief.md
UUID: dashboard-mobile-pilan-20260512
Status: QA Complete
---

## Changelog

| Date | Change | Author |
| --- | --- | --- |
| 2026-05-12 | Mobile connectivity diagnostics + host-policy fix + runtime smoke rerun | pidex-qa |

## Timeline

- Strategy start: 2026-05-12
- Testing start: 2026-05-12
- Testing complete: 2026-05-12
- Final status: QA Complete

## Phase 1: Test Strategy

- Goal: isolate mobile-only `ERR_CONNECTION_ABORTED` on `pi.lan:18777`.
- Checks: listener bind, Host header handling, DNS resolution, LAN reachability, browser tooling availability.
- Tooling infra: `playwright-cli` unavailable. Fallback used: `npx playwright` + `curl` + `ss`.
- Coverage focus: user-open `/dashboard` from localhost, LAN IP, pi.lan hostname.

## Phase 2: Test Execution Results

### Commands + evidence

- `ss -ltnp | grep :18777` => `LISTEN 0.0.0.0:18777` node pid 3634789.
- `curl http://127.0.0.1:18777/dashboard` => `200`.
- `curl -H 'Host: pi.lan:18777' http://127.0.0.1:18777/dashboard` => `200`.
- `curl http://10.0.0.103:18777/dashboard` => `200`.
- `curl http://pi.lan:18777/dashboard` => `Could not resolve host: pi.lan` (domain DNS/mDNS failure on host).
- `/tmp/pidex-dashboard-18777.log` shows Vite preview network URL on LAN IP only.

### Playwright CLI status

- `playwright-cli` command missing (`command not found`).
- Fallback `npx playwright` attempted.
- Browser run blocked by missing system libs (`libgtk-4.so.1`, `libgstreamer-1.0.so.0`, etc). No screenshot artifact produced.

## Heartbeat

- N/A (no vitest run in this task).

## Findings

1. Server healthy on LAN IP + port 18777.
2. Host-header checks pass.
3. Primary failure path: `pi.lan` name resolution not reliable in this environment; mobile likely hitting same DNS/mDNS gap.
4. Secondary hardening needed: Vite host allowlist too narrow for alternate mobile hostnames.

## Fixes Applied

File changed: `<pidex-root>/dashboard/vite.config.ts`

- `server.allowedHosts` changed `['pi.lan'] -> true`
- `preview.allowedHosts` changed `['pi.lan'] -> true`

Why: remove hostname-policy blocker for mobile clients resolving host differently (`pi.lan.local`, router DNS alias, direct LAN hostnames).

Dashboard restarted with `<pidex-root>/dashboard/start.sh` after config change.

## Mobile URL to try now

- Primary stable: `http://10.0.0.103:18777/dashboard`
- Domain target (works only if LAN DNS/mDNS maps): `http://pi.lan:18777/dashboard`

## Routing

<!-- ROUTING
verdict: COMPLETE
route_to: orchestrator
reason: diagnostics complete, safe config hardening applied, runtime evidence captured
gate: none
context_file: <pidex-root>/agents.output/qa/dashboard-mobile-pilan-playwright.md
-->
