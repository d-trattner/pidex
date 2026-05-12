# Implementer security fix2 brief: 4-provider-limits-native

Project cwd: `/home/daniel/pidex`
Security v2 rejection: `agents.output/security/4-provider-limits-native-security-v2.md`
Expected output: `agents.output/implementation/4-provider-limits-native-security-fix2.md`

Fix SEC-1 bypass only:
- Current guard trusts `new URL(request.url).hostname` / Host header for locality; hostile LAN client can spoof Host while server is bound `0.0.0.0`.
- Implement secure default so provider-limits endpoints are not exposed unauthenticated on LAN.

Preferred minimal remediation:
1. Change dashboard package scripts and `dashboard/start.sh` default bind host to `127.0.0.1` (loopback). Update help text/URL printing as needed.
2. For explicit public bind (`--host 0.0.0.0` or non-loopback), set an env flag in start.sh (e.g. `PIDEX_DASHBOARD_PUBLIC_BIND=1`) and make provider-limits auth require token instead of Host-derived localhost bypass.
3. Keep local loopback behavior working by default for `/limits` and API validation.
4. Add regression tests for public-bind mode: spoofed `http://127.0.0.1` URL/Host is denied without token; token allows; cross-origin writes denied/controlled.

Constraints:
- Do not redesign dashboard-wide auth.
- Preserve local `/limits` behavior with default loopback host.
- Preserve unrelated dirty changes.
- Rerun focused auth tests.

ROUTING must include `context_file: agents.output/implementation/4-provider-limits-native-security-fix2.md` and route to `pidex-security`.
