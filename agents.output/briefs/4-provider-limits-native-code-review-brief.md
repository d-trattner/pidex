# Code review brief: 4-provider-limits-native

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-provider-limits-native-plan.md`
Implementation: `agents.output/implementation/4-provider-limits-native-implementation.md`
Expected output: `agents.output/code-review/4-provider-limits-native-code-review.md`

Review only the intended implementation changes for PIDEX-native provider limits:
- `scripts/provider-limits/probe.py`
- `scripts/provider-limits/test_probe_tdd.py`
- `scripts/profile/recommend.sh`
- `dashboard/lib/server/limits.ts`
- `dashboard/lib/server/limits.tdd.test.mjs`
- `dashboard/routes/api/provider-limits/profile.tsx`
- `dashboard/routes/api/provider_limits/profile.tsx`
- `dashboard/routes/limits.tsx`
- any directly related provider-limits API files.

Check correctness, maintainability, tests, no recommendation behavior, no `<running-pi-root>` dependency, codex/codex-spark visibility when records are present, and preservation of profiles.

Do not implement changes. ROUTING must include `context_file: agents.output/code-review/4-provider-limits-native-code-review.md`.
