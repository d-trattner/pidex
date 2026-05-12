---
ID: 3
Origin: 3
UUID: 8f3ac1d2
Status: Code Review Approved
Target Release: vNext
Epic: Dashboard route topology correction
---

## Changelog
- 2026-05-12: Initial micro-plan drafted from brief.
- 2026-05-12: Critic revision: added Execution Profile, Skipped Agents declaration, Retro Mode declaration.
- 2026-05-12: Code review approved (pidex-code-reviewer).

## Value Statement and Business Objective
As dashboard user, I want core pages at root routes (`/live`, `/overview`, `/analysis`, etc.), so navigation predictable and `/dashboard` stays simple landing entry.

## Objective Summary
1. Keep `/dashboard` as landing-only page.
2. Expose dashboard content pages at root routes.
3. Preserve API routes/contracts, English copy, visual style.
4. Document behavior for old `/dashboard/*` paths.

## Scope and Constraints
- In scope: `/home/daniel/pidex/dashboard` route structure, navigation links, route compatibility handling.
- Out of scope: API endpoint changes, copy rewrites, UI redesign.
- Constraint: no contract break on backend/API paths.

## Assumptions
- Existing page components can be reused for root routes.
- Old nested routes can be redirected or removed with explicit behavior note.
- No auth/path prefix contract depends on `/dashboard/*` frontend paths.

## Open Questions
- OPEN QUESTION [CLOSED]: Redirect old `/dashboard/*` to root equivalents or hard-remove? Plan sets redirect-preferred for compatibility.

## Release Alignment
- Target Release: vNext (brief did not provide tagged semantic version).
- Release intent: route normalization fix with no API contract impact.

## Execution Profile
Profile: ui-heavy  
Reason: Route topology + navigation behavior change across multiple user-facing screens; parity and browser evidence required.

Skipped Agents:
| Agent | Skip? | Reason | Safety condition |
|---|---:|---|---|
| pidex-designer | No | Existing-screen parity still needs UI gate discipline. | Keep visual pattern/copy parity across migrated routes. |
| pidex-security | Yes | No API/auth/storage/input/dependency/secrets/outward-error changes in scope. | If implementation touches API/auth/storage/deps, remove skip and run security gate. |
| pidex-code-reviewer | No | Multi-route product change needs independent code-quality gate. | Must verify route map, redirects, and link updates. |
| pidex-qa | No | Product code + navigation behavior changed. | Must validate route behavior and regressions. |
| pidex-uat | No | User-facing route behavior value claim needs user validation. | Must confirm root-path UX and legacy path handling. |

Retro Mode: mini  
Retro reason: Standard feature change with no current rejection/security/process incident trigger requiring full retro.  
Post-retro handoffs: none

## Plan Slices
1. **Slice 1 (Tracer bullet, highest complexity): Root route enablement + one migrated page path**
   - Add root route entry pattern and prove one content route (`/live`) renders same content/style as current nested page.
   - Update shared nav/link source to root path for migrated page.
   - Acceptance: `/live` works, `/dashboard` remains landing.

2. **Slice 2: Complete root route migration for remaining pages**
   - Migrate/attach `/overview`, `/runs`, `/tokens`, `/pipelines`, `/quality`, `/analysis`, `/limits`.
   - Ensure nav uses root URLs only.
   - Acceptance: all target root routes render prior content/copy.

3. **Slice 3: Backward path handling for `/dashboard/*`**
   - Implement compatibility behavior (redirect mapping or documented deprecation fallback) for old nested paths.
   - Acceptance: old `/dashboard/live` behavior documented and verified.

4. **Slice 4 (mechanical): Validation, docs, release notes**
   - Run required checks; record outputs and any FALLOW / FALLOW-SKIP for JS/TS QA.
   - Update implementation artifact notes for route map change.

## File Impact Map
- `src/routes/dashboard.tsx` (landing-only behavior, links)
- `src/routes/dashboard/*.tsx` (source pages currently nested; reused/mapped)
- `src/routes/*.tsx` (new or migrated root route entries for overview/runs/tokens/pipelines/quality/analysis/live/limits)
- Navigation/shared link source files under `src/components/**` or `src/routes/**` currently pointing to `/dashboard/*`
- Optional route compatibility file(s) handling legacy `/dashboard/*` path redirects

## Validation Commands
- `node --test tests/dashboard-copy-and-interactions.test.mjs`
- `npm run typecheck`
- `npm run build`
- `./start.sh --no-build`
- Manual smoke: `/dashboard`, `/live`, `/overview`, `/analysis`, `/dashboard/live` (record redirect/legacy behavior)
- JS/TS QA record: `FALLOW` or `FALLOW-SKIP` with reason in implementation/QA artifacts.

## Testing Strategy
- Unit/integration: route resolution and navigation target assertions.
- End-to-end smoke: landing + representative root routes + legacy nested path.
- Non-functional: ensure no API path or data contract behavior changes.

## Risks and Mitigations
- Risk: broken internal links after path migration. Mitigation: central nav link audit + smoke matrix.
- Risk: stale deep links to `/dashboard/*`. Mitigation: compatibility redirects + release note callout.
- Risk: visual drift. Mitigation: reuse existing page components, no style refactor.

## User Preview Requirement
- Mandatory post-devops user preview before G4.
- Preview must show `/dashboard` landing-only and root-route navigation flow (`/live`, `/overview`, `/analysis`) with legacy path behavior note.

## Handoff Notes
- Preserve copy verbatim from existing pages.
- Preserve styling primitives and layout wrappers.
- Keep API contracts untouched.

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-critic
context_file: /home/daniel/pidex/agents.output/planning/dashboard-root-routes-plan.md
-->
