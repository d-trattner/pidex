# Planner brief: PIDEX-native provider limits

Project cwd: `/home/daniel/pidex`
Plan id: `4`
Slug: `provider-limits-native`
Mode: direct pidex orchestrator.

Confirmed epic:
Implement PIDEX-native provider-limits collection in `/home/daniel/pidex`. Replace/adapt the current minimal `scripts/provider-limits/probe.py` so it probes Codex and Codex Spark usage directly into `/home/daniel/pidex/state/provider-limits/latest.json`, without depending on `/home/daniel/running-pi`. Preserve `config/profiles/codex-optimized.json` and `config/profiles/codex-high.json`, remove recommendation behavior, and ensure `/api/provider-limits` and `/limits` show real `codex` / `codex-spark` rows when data is available. Acceptance: probe output contains records, API returns those records, `/limits` UI displays them, and build/typecheck/tests pass.

Initial reconnaissance:
- `scripts/provider-limits/probe.py` is currently a minimal helper that returns profiles, active_profile, records (often empty), and recommended_profile.
- `dashboard/lib/server/limits.ts` reads `state/provider-limits/latest.json`, exposes `recommended_profile`, filters records by provider names containing codex/openai-codex/gpt-5.3-codex/pi unless show_historical=true.
- `dashboard/routes/api/provider-limits.tsx` GET returns `getLimits`; POST sets active profile.
- `dashboard/routes/limits.tsx` displays profile buttons and records table.
- Profiles to preserve: `config/profiles/codex-optimized.json`, `config/profiles/codex-high.json`.

Constraints:
- No dependency on `/home/daniel/running-pi`.
- Preserve codex-optimized/codex-high profiles.
- Remove recommendation behavior: do not recommend switching profiles; active profile selection may remain.
- Make real rows appear for `codex` and `codex-spark` when data is available.
- Validate with provider-limits probe output, `/api/provider-limits`, `/limits` UI, build/typecheck/tests.
- Existing repo is dirty from prior work; do not overwrite unrelated changes.

Expected planner output: `agents.output/planning/4-provider-limits-native-plan.md`

Routing requirements:
- Final response must include valid `<!-- ROUTING -->` block.
- `context_file:` must point to the plan artifact and the file must exist.
- `route_to:` should be `pidex-critic` when implementation-ready, or a specific agent/user if blocked.
