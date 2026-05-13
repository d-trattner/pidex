# Implementer G9 fix brief

Project cwd: `<pidex-root>`
Plan: `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`
QA: `agents.output/qa/4-dashboard-parity-mobile-projects-qa.md`
UAT: `agents.output/uat/4-dashboard-parity-mobile-projects-uat.md`
Expected output: `agents.output/implementation/4-dashboard-parity-mobile-projects-g9-fix.md`

User G9 rejection:
> quality charts are not mobile compatible, must: 1 chart per row

Fix only this issue:
- On mobile/narrow viewport, every Quality chart/card must occupy one full row. No two charts/cards side-by-side.
- Preserve desktop layout.
- Ensure actual rendered `/quality` mobile view, not just CSS intent. Inspect `dashboard/routes/quality.tsx` and `dashboard/app/styles/theme.css`; chart cards may be using inline `gridColumn` or classes that override mobile CSS.
- Add/adjust CSS/classes or component markup so mobile proves one chart per row.
- Capture/describe focused validation. If browser screenshot possible, use Chromium/headless or leave to orchestrator.

Constraints:
- Do not change unrelated features.
- Preserve project selector/token work.
- Because this is post-G9 code change, run targeted typecheck/build or focused validation.

ROUTING context_file must be expected output; route to `pidex-code-reviewer` when complete.
