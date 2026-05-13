# Planner revision brief: 4-provider-limits-native

Project cwd: `<pidex-root>`
Plan to revise: `agents.output/planning/4-provider-limits-native-plan.md`
Critique: `agents.output/critic/4-provider-limits-native-critique.md`

Required revision only; do not implement.

Address all critic blockers:
- C1: Add valid Execution Profile contract. Likely `api-security` plus explicit UI handling. Include skipped-agent table/safety conditions and do not skip code-review, security, QA, UAT for this product/API/UI scope.
- C2: Add valid Retro Mode: `none`, `mini`, or `full`. Likely `mini`, with reason and post-retro handoff expectations.
- C3: Add User Preview Requirement table with command/URL/route `/limits`, port/start script details or TBD, desktop/mobile viewport need.
- M1: Add UI Quality Contract with screenshot matrix for `/limits` loaded rows, empty records, loading/error if feasible, desktop and mobile if relevant.
- L1: Add probe/API/UI validation note/assertion for `codex` and `codex-spark` when source/fixture data exists.

Expected output: overwrite/update `agents.output/planning/4-provider-limits-native-plan.md`.

ROUTING must include `context_file: agents.output/planning/4-provider-limits-native-plan.md` and route to `pidex-critic`.
