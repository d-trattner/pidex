# PIDEX Dashboard Root Routes Brief

Project cwd: `<pidex-root>/dashboard`
User request: The dashboard currently nests pages under `/dashboard/*` by mistake. `/dashboard` should be only a landing page. Functional dashboard routes should live directly under root, e.g. `/live` instead of `/dashboard/live`.

Current context:
- Dashboard is TanStack Start/Vite running on `http://pi.lan:18777/dashboard` and LAN IP.
- Recent fixes made build/typecheck pass and fixed missing child Outlet under `/dashboard`.
- Current files include `routes/dashboard.tsx` parent/landing and `routes/dashboard/{overview,runs,tokens,pipelines,quality,analysis,live,limits}.tsx` child pages.
- Required API paths must remain unchanged.

Goal:
- Make `/dashboard` a landing page only, with links to top-level pages.
- Move/route pages to top-level URLs: `/overview`, `/runs`, `/tokens`, `/pipelines`, `/quality`, `/analysis`, `/live`, `/limits`.
- Remove or redirect old `/dashboard/*` routes if practical; at minimum the primary nav must use root routes and content must change correctly.
- Preserve English copy and existing visual style.

Validation:
- `node --test tests/dashboard-copy-and-interactions.test.mjs`
- `npm run typecheck`
- `npm run build`
- Restart with `./start.sh --no-build`
- Smoke: `/dashboard`, `/live`, `/overview`, `/analysis`, and ideally old `/dashboard/live` behavior documented.

Expected artifacts:
- Plan: `<pidex-root>/agents.output/planning/dashboard-root-routes-plan.md`
- Implementation: `<pidex-root>/agents.output/implementation/dashboard-root-routes-implementation.md`
- QA: `<pidex-root>/agents.output/qa/dashboard-root-routes-qa.md`
