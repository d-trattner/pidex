# PIDEX Dashboard Mobile pi.lan Connectivity Brief

Project cwd: `/home/daniel/pidex/dashboard`
User report: On mobile, `pi.lan` shows `ERR_CONNECTION_ABORTED` after dashboard was moved from old Python server to new TanStack/Vite preview on port 18777.

Current context:
- Old Python dashboard server on 18777 was stopped.
- New dashboard started with `/home/daniel/pidex/dashboard/start.sh` on `0.0.0.0:18777`.
- Vite allowed host was updated in `vite.config.ts` for `pi.lan` under both `server.allowedHosts` and `preview.allowedHosts`.
- Local host-header test passed: `curl -H 'Host: pi.lan:18777' http://127.0.0.1:18777/dashboard` returned 200.
- Browser/mobile still reports `ERR_CONNECTION_ABORTED`.

Task:
1. Use Playwright CLI where useful to validate the dashboard page and collect browser/network evidence.
2. Diagnose likely causes for mobile-only `ERR_CONNECTION_ABORTED`: DNS/IPv6 mismatch, port binding, process mismatch, strict host check, HTTP vs HTTPS, firewall, stale service worker/cache, proxy, LAN reachability.
3. Apply the smallest safe fix if found under `/home/daniel/pidex/dashboard` only.
4. Restart dashboard if config/start script changes.
5. Write QA artifact with evidence, fix, and exact mobile URL to try.

Required checks:
- `ss -ltnp | grep :18777`
- `curl` via localhost and LAN IP if possible.
- `curl` with `Host: pi.lan:18777`.
- Playwright CLI page open/snapshot for `http://127.0.0.1:18777/dashboard` and, if resolvable locally, `http://pi.lan:18777/dashboard`.
- Check `/tmp/pidex-dashboard-18777.log`.

Expected output: `/home/daniel/pidex/agents.output/qa/dashboard-mobile-pilan-playwright.md`

ROUTING must include `context_file: /home/daniel/pidex/agents.output/qa/dashboard-mobile-pilan-playwright.md`.
