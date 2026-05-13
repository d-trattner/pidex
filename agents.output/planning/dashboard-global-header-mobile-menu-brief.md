# PIDEX Dashboard Global Header + Mobile Menu Brief

Project cwd: `<pidex-root>/dashboard`

User request:
- The header (PIDEX logo/menu) is not always visible.
- Need a Header component and Menu component rendered on every page.
- Menu needs mobile rework: an always-visible bottom button that opens a sheet.

Current context:
- Dashboard routes were recently migrated so `/dashboard` is a landing page and content pages are top-level (`/live`, `/overview`, `/analysis`, `/runs`, `/tokens`, `/pipelines`, `/quality`, `/limits`). Legacy `/dashboard/*` redirects exist.
- Dashboard runs at `http://pi.lan:18777/dashboard` and `http://pi.lan:18777/live` on port 18777.
- Tests/build/typecheck currently pass.
- Preserve API routes/contracts and visual style.

Desired behavior:
- A shared dashboard header (logo/title + desktop menu) renders on every user-facing dashboard page, including `/dashboard`, `/live`, `/overview`, `/analysis`, `/runs`, `/tokens`, `/pipelines`, `/quality`, `/limits`.
- Header/menu should not duplicate per page or disappear when navigating.
- Desktop: menu visible in header.
- Mobile: persistent bottom menu button always visible; tapping/clicking opens a sheet/drawer with navigation links; links close sheet and navigate.
- Keep implementation accessible: aria labels, button state, keyboard-friendly close behavior where feasible.
- Keep existing glass style.

Constraints:
- Modify only `<pidex-root>/dashboard` product files and artifacts.
- No API path changes.
- Keep scope small; component extraction is expected.

Validation:
- `node --test tests/dashboard-copy-and-interactions.test.mjs` (extend tests if useful)
- `npm run typecheck`
- `npm run build`
- Restart with `./start.sh --no-build`
- Runtime route smoke for `/dashboard`, `/live`, `/overview`, `/analysis`
- Browser/screenshot evidence if feasible (system Chromium is available; Playwright CLI may not be)

Expected artifacts:
- Plan: `<pidex-root>/agents.output/planning/dashboard-global-header-mobile-menu-plan.md`
- Implementation: `<pidex-root>/agents.output/implementation/dashboard-global-header-mobile-menu-implementation.md`
- QA: `<pidex-root>/agents.output/qa/dashboard-global-header-mobile-menu-qa.md`
