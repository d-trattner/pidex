# Post-retro architect handoff: 4-provider-limits-native

Project cwd: `<pidex-root>`
Retrospective: `agents.output/retrospective/4-provider-limits-native-retrospective.md`
Security docs: `agents.output/security/4-provider-limits-native-security-v5.md`
Expected output: `agents.output/architecture/4-provider-limits-native-postretro-architecture.md`

Capture/update architecture pattern notes from retro:
- Provider-limits API secure-by-default: dashboard loopback bind by default; explicit public bind requires token for provider-limits endpoints.
- Provider-limit state flow: `state/provider-limits/native-records.json` source/fallback -> probe -> canonical `state/provider-limits/latest.json` -> API/UI.
- Avoid recommendation behavior; active profile only.

No product code edits. ROUTING context_file must be expected output.
