# PIDEX Dashboard English + Buttons Brief

Project cwd: `<pidex-root>/dashboard`
User request: two next-epic items:
1. Change dashboard UI language/copy to English.
2. Fix non-working buttons/interactions across the dashboard.

Context:
- Dashboard is TanStack Start/Vite and currently runs at `http://pi.lan:18777/dashboard` / `http://10.0.0.103:18777/dashboard`.
- Recent readiness work made `npm run typecheck` and `npm run build` pass.
- Preserve API paths/contracts and existing visual style.
- Do not change unrelated PIDEX runtime files.
- Playwright CLI may be unavailable; use browser/runtime evidence if possible, otherwise targeted code review + curl/static checks.

Expected work:
- Audit `routes/dashboard/**`, `components/**`, `app/**`, maybe `README/start.sh` output if user-facing.
- Translate German visible dashboard strings to English.
- Investigate/fix buttons/tabs/links/dropdowns/actions not responding. Likely areas: navigation links, route redirects, analysis document selectors, refresh/action buttons, top/menu tab controls.
- Keep changes minimal and scoped.

Required validation:
- `npm run typecheck`
- `npm run build`
- Restart dashboard if needed.
- Smoke main pages and key API endpoints.
- Document any Playwright/Fallow skip or evidence.

Expected artifacts:
- Plan: `<pidex-root>/agents.output/planning/dashboard-english-buttons-plan.md`
- Implementation: `<pidex-root>/agents.output/implementation/dashboard-english-buttons-implementation.md`
- QA: `<pidex-root>/agents.output/qa/dashboard-english-buttons-qa.md`
