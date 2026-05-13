---
ID: 2
Origin: 2
UUID: b7c41e9a
Status: Code Review Approved
Target Release: v0.1.0
Epic: Dashboard English Copy + Interaction Reliability
---

## Changelog
- 2026-05-12: Initial micro-plan from dashboard brief + UI rule contracts.
- 2026-05-12: Status set to In Progress by pidex-implementer.
- 2026-05-12: Status set to Code Review Approved by pidex-code-reviewer.

## Value Statement and Business Objective
As dashboard user, I want English UI copy + working buttons/interactions, so flows become clear, clickable, trustworthy.

## Objective Summary
1. Remove German user-visible copy across dashboard surfaces.
2. Restore broken button/link/table actions on existing screens.
3. Keep API contracts, paths, visual style unchanged.

## Scope and Constraints
- Scope: `<pidex-root>/dashboard` only.
- Preserve API endpoints + payload contracts.
- Preserve layout, classes, design language.
- Slice size: 1-3 files per slice.

## Execution Profile
Profile: ui-heavy
Reason: multi-route UI copy + interaction behavior + browser evidence requirements.
Retro Mode: mini
Retro reason: user-visible behavior change, no structural/security trigger expected.
Post-retro handoffs: none.
Skipped Agents: none — full pipeline required (critic, implementer, code-review, qa, uat, devops).

## UI Intent Boundary
### Must Preserve
- Route structure `/dashboard/*`.
- Existing visual hierarchy/components/classes.
- API fetch paths under `/api/*`.

### May Change
- Visible string copy.
- Event wiring/handler guards for non-working controls.
- aria labels if needed for clarity.

### Forbidden Changes
- New feature scope unrelated to copy/buttons.
- API schema/path changes.
- Visual redesign.

### Source-of-Truth Screens / Files
- `routes/dashboard.tsx`
- `routes/dashboard/index.tsx`
- `routes/dashboard/analysis.tsx`
- other `routes/dashboard/*.tsx` with visible copy/actions.

## Existing UI Parity Contract
| Existing behavior/layout | Keep/change? | New mapping | Evidence needed |
|---|---|---|---|
| Dashboard nav pills + section cards | KEEP | copy English only | before/after screenshots |
| Analysis tables + open action | ADAPT | action works, copy English | click flow evidence |
| Page-level loading/empty/error messages | ADAPT | English text, same state logic | browser state capture |

## Assumptions
- Non-working interactions exist mostly in dashboard route files (links/buttons/table actions), not backend.
- `v0.1.0` remains active dashboard release lane.

## Open Questions
- OPEN QUESTION [CLOSED]: If hidden runtime-only broken controls found outside routes, include same epic only when file still in dashboard scope.

## Slice Plan (Vertical)
1. Slice 1 — Tracer bullet: Analysis screen interaction + copy baseline (1-3 files)
   - Objective: Prove one end-to-end button flow works (`open` doc) with English copy.
   - Acceptance: action clickable, selected document loads, no console errors.
2. Slice 2 — Cross-dashboard copy translation pass (1-3 files per commit chunk)
   - Objective: convert visible German strings on high-traffic screens (landing, live, quality, pipelines, limits, analysis viewer text).
   - Acceptance: no German user-facing strings remain on touched screens.
3. Slice 3 — Navigation/button reliability sweep (1-3 files)
   - Objective: fix remaining non-responsive controls/links/tabs discovered during smoke pass.
   - Acceptance: primary nav + per-page actions respond on desktop/mobile smoke.
4. Slice 4 — Version/release artifact updates (mechanical)
   - Objective: update required release notes/version artifacts per repo policy.
   - Acceptance: artifact diff limited to release bookkeeping.

## UI Quality Contract
Pattern source: existing dashboard glass-card/nav/table patterns in current route files.
Reuse decision: reuse existing patterns; behavior/copy adjustments only.

### Screenshot Matrix
| Screenshot ID | Surface/route | Viewport | State | Required evidence | Owner |
|---|---|---|---|---|---|
| SS-1 | `/dashboard` | 1280x720 | loaded | English landing copy visible | QA |
| SS-2 | `/dashboard/analysis` | 1280x720 | table + action clicked | document viewer populated | QA |
| SS-3 | `/dashboard/live` | 1280x720 | loading/loaded/error as available | English state copy | QA |
| SS-4 | `/dashboard` + one subpage | 375x812 | mobile nav/action usable | no overlay block | QA |

Artifact directory: `.playwright/` (gitignored).

### Mobile UI Contract
| Surface | Viewport | Layout behavior | Interaction/touch behavior | Keyboard/overlay/safe-area behavior | Evidence |
|---|---|---|---|---|---|
| Dashboard nav + analysis action | 375x812 | same cards/nav wrapping | tap targets usable | no overlap blocks taps | SS-4 + smoke notes |

### Accessibility Baseline
| Surface/control | Label/name | Keyboard/focus expectation | Status/error announcement | Contrast/touch target expectation | Evidence |
|---|---|---|---|---|---|
| Nav pills + analysis open button | English accessible labels | tab focus visible, enter/space activate | load/error text readable | existing contrast preserved, touch targets >=44px where possible | browser capture + manual keyboard pass |

## Validation Commands
- `cd <pidex-root>/dashboard && npm run typecheck`
- `cd <pidex-root>/dashboard && npm run build`
- `cd <pidex-root>/dashboard && npm run dev` then manual smoke routes.
- API sanity (contract preserved): `curl -i http://127.0.0.1:18777/api/analysis`, `.../api/analysis/plans`, `.../api/live`.

## Testing Strategy
**Gate G9**: required — user-visible dashboard copy + interaction behavior changes.
- Static: TypeScript typecheck + production build pass.
- Runtime smoke: Playwright Browser-Level Smoke mandatory (desktop 1280x720 + mobile 375x812): 0 console errors, theme token present, center-point element interactive, nav/action click path passes.
- Functional: core route navigation + analysis document open flow + translated status text review.
- JS/TS QA runner: run Fallow for required checks; if unavailable, document explicit `FALLOW-SKIP` reason + fallback evidence in QA artifact.

## QA/Browser Evidence Expectations
- Attach Playwright screenshots per matrix IDs SS-1..SS-4.
- Record short step log: route, action, result for each fixed control.
- Include console/network error summary (expect zero blocking errors).
- If Playwright tool unavailable: manual browser evidence + command output + explicit gap callout.

## User Preview Requirement
| Field | Value |
|---|---|
| UI involved | yes |
| Preview required before G4 | yes |
| Preview command | `cd <pidex-root>/dashboard && npm run dev` |
| Preview URL/port | `http://pi.lan:18777/dashboard` (or `http://10.0.0.103:18777/dashboard`) |
| Routes/screens to inspect | `/dashboard`, `/dashboard/analysis`, `/dashboard/live`, one additional touched route |
| Mobile viewport needed | yes |

## Risks and Mitigations
- Risk: hidden German strings missed. Mitigation: grep sweep + browser pass across all dashboard routes.
- Risk: button fix accidentally changes style. Mitigation: parity contract + screenshot comparison.
- Risk: runtime-only failures not caught by static checks. Mitigation: Playwright smoke + manual interaction log.

## Handoff Notes
- Implementer prioritize complexity-first slice order above.
- Keep commits small per slice (1-3 files).
- Do not modify API contract or non-dashboard repo paths.

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-critic
reason: Micro-plan ready with UI contracts, slices, validation, preview, Fallow handling.
context_file: <pidex-root>/agents.output/planning/dashboard-english-buttons-plan.md
-->
