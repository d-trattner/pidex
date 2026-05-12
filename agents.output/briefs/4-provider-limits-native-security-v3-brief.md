# Security v3 brief: 4-provider-limits-native

Project cwd: `/home/daniel/pidex`
Security v2 rejection: `agents.output/security/4-provider-limits-native-security-v2.md`
Fix2 implementation: `agents.output/implementation/4-provider-limits-native-security-fix2.md`
Expected output: `agents.output/security/4-provider-limits-native-security-v3.md`

Verify SEC-1 Host-spoof/locality bypass is resolved:
- Dashboard defaults should bind loopback, not 0.0.0.0.
- Public bind should force provider-limits token (or equivalent) and deny spoofed loopback URL/Host without token.
- Write controls should remain adequate.
- Regression tests should cover spoofed loopback denial/token allow/cross-origin write denial.

Run/document Fallow per rule. Do not modify files.

ROUTING must include `context_file: agents.output/security/4-provider-limits-native-security-v3.md` and route to `pidex-qa` if approved.
