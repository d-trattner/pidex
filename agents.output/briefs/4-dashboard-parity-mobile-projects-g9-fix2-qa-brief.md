# QA brief: G9 fix2 mobile Quality one chart per row

Project cwd: `/home/daniel/pidex`
Fix2: `agents.output/implementation/4-dashboard-parity-mobile-projects-g9-fix2.md`
Code review: `agents.output/code-review/4-dashboard-parity-mobile-projects-g9-fix2-code-review.md`
Expected output: update/append `agents.output/qa/4-dashboard-parity-mobile-projects-qa.md` or write `agents.output/qa/4-dashboard-parity-mobile-projects-g9-fix2-qa.md`

QA only the post-G9 fix:
- focused test `node dashboard/tests/quality-mobile-layout.test.mjs`
- `npm -C dashboard run typecheck`
- browser/computed or screenshot evidence at mobile width proving Quality chart/cards are one per row.
If browser blocked, route to orchestrator with `browser smoke BLOCKED`.

ROUTING context_file must be the QA artifact.
