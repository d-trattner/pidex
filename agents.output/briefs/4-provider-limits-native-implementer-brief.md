# Implementer brief: 4-provider-limits-native

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-provider-limits-native-plan.md`
Critic approval: `agents.output/critic/4-provider-limits-native-critique-v2.md`
Expected output: `agents.output/implementation/4-provider-limits-native-implementation.md`

Implement the approved plan. Key constraints:
- Inspect `git status --short` first; repo is dirty from unrelated prior work. Do not overwrite unrelated changes.
- No dependency on `<running-pi-root>`.
- Preserve `config/profiles/codex-optimized.json` and `config/profiles/codex-high.json`.
- Remove recommendation behavior from active probe/API/UI/profile surfaces (`recommended_profile`, recommend scripts/routes) without editing historical agents.output/analysis artifacts.
- Make native probe write/read `<pidex-root>/state/provider-limits/latest.json` with `codex` and `codex-spark` records when available.
- Keep API compatibility routes working where present.
- Validate probe, API, /limits UI path as much as possible; document any environmental limitation.

Likely files:
- `scripts/provider-limits/probe.py`
- `scripts/profile/recommend.sh` or active profile helper surface if applicable
- `dashboard/lib/server/limits.ts`
- `dashboard/routes/api/provider-limits.tsx`
- `dashboard/routes/api/provider-limits/profile.tsx`
- `dashboard/routes/api/provider_limits.tsx`
- `dashboard/routes/api/provider_limits/profile.tsx`
- `dashboard/routes/limits.tsx`
- tests as needed

Do not implement release/devops commits unless already required by local convention.

ROUTING must include `context_file: agents.output/implementation/4-provider-limits-native-implementation.md` and route to `pidex-code-reviewer` when complete.
