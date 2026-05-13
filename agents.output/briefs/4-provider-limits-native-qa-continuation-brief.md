# QA continuation brief: 4-provider-limits-native

Prior QA spawn hit turn limit after creating mostly empty `agents.output/qa/4-provider-limits-native-qa.md`. Finish QA with a tight command set.

Project cwd: `<pidex-root>`
Expected output: overwrite/fill `agents.output/qa/4-provider-limits-native-qa.md`

Required commands/evidence:
1. Fallow audit: `npx fallow audit --format json --quiet --explain 2>/dev/null || true` and summarize top findings.
2. Probe tests: `python3 scripts/provider-limits/test_probe_tdd.py`.
3. JS tests: `node --experimental-strip-types --test dashboard/lib/server/provider-limits-auth.tdd.test.mjs dashboard/lib/server/limits.tdd.test.mjs`.
4. Package/security: `npm -C dashboard audit --omit=dev --json` (summarize vulnerabilities count), `npm -C dashboard run typecheck`, `npm -C dashboard run build`.
5. Seed/native provider records: ensure `state/provider-limits/native-records.json` has codex and codex-spark test rows or use existing fixture mechanism; run `python3 scripts/provider-limits/probe.py`; assert `state/provider-limits/latest.json` has records and no `recommended_profile`.
6. API/browser smoke if feasible: start dashboard on a test port, curl `/api/provider-limits` and `/api/provider_limits`, verify no recommended_profile and codex/codex-spark rows. For `/limits` UI screenshot evidence, use Playwright/browser if available; if not feasible, route to `orchestrator` with reason containing `browser smoke BLOCKED`.

Do not explore broadly. Do not modify product code unless only creating/restoring QA seed data under state provider-limits is needed; document any state changes.

ROUTING must include `context_file: agents.output/qa/4-provider-limits-native-qa.md`.
