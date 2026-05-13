# PIDEX Dashboard Mobile Design + Limits Data Brief

Project cwd: `<pidex-root>/dashboard`

User task: Improve PIDEX dashboard mobile design and fix Limits provider data.

Goals:
1. Fix mobile layout overflow: some pages are wider than the viewport.
2. Rework mobile bottom menu button:
   - always visible on every page
   - square/solid bottom control
   - spans the full screen width or full-width bottom bar style
   - easy to tap on mobile
3. Rework mobile menu sheet:
   - better visual design
   - one menu item per row
   - clear active/current page state
   - smooth open/close animation
   - accessible close behavior and focus handling
4. Fix oversized tables:
   - tables must not break mobile width
   - add horizontal scroll containers where needed
5. Fix Limits page data:
   - Codex and Codex Spark limits should show real data if available
   - diagnose whether issue is API data, provider naming, filtering, or UI mapping.

Constraints:
- Preserve root routes: `/live`, `/overview`, `/analysis`, `/limits`, etc.
- Preserve API paths/contracts.
- Preserve current glass visual style while improving mobile usability.
- Use shared header/menu components; no duplicate page-level nav.
- Modify only `<pidex-root>/dashboard` product files and artifacts.
- Run tests/build/typecheck, runtime route smoke, and mobile screenshot/browser evidence if feasible.

Current context:
- Shared global header/mobile sheet exists in `components/navigation/global-nav.tsx` and is mounted in root route.
- Recent validations passed: `node --test tests/dashboard-copy-and-interactions.test.mjs`, `npm run typecheck`, `npm run build`.
- Dashboard start: `./start.sh --no-build`, URL `http://pi.lan:18777/dashboard` and root pages like `/live`.
- System Chromium is available; `playwright-cli` may be unavailable.

Expected artifacts:
- Plan: `<pidex-root>/agents.output/planning/dashboard-mobile-design-limits-plan.md`
- Design: `<pidex-root>/agents.output/design/dashboard-mobile-design-limits-design.md`
- Implementation: `<pidex-root>/agents.output/implementation/dashboard-mobile-design-limits-implementation.md`
- QA: `<pidex-root>/agents.output/qa/dashboard-mobile-design-limits-qa.md`
