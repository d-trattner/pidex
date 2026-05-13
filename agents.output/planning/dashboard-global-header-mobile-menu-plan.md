---
ID: 3
Origin: 3
UUID: 7c9a2d4f
Status: Code Review Approved
Target Release: v0.1.0
Epic: Shared Dashboard Navigation Consistency
---

## Changelog
- 2026-05-12: Plan finalized from brief; UI rule contracts bound.
- 2026-05-12: Implementation started by pidex-implementer.
- 2026-05-12: Code review re-check approved; route to pidex-security.

## Value Statement and Business Objective
As dashboard user, I want persistent global header/menu plus mobile always-visible menu button opening sheet, so that navigation stays fast/clear on every page and viewport.

## Objective and Scope
- In: shared Header/Menu for `/dashboard`, `/live`, `/overview`, `/analysis`, `/runs`, `/tokens`, `/pipelines`, `/quality`, `/limits`.
- In: mobile bottom button, sheet open/close, keyboard/focus/a11y baseline, glass style parity.
- Out: API changes, route contract changes, non-nav redesign.

## Execution Profile
Profile: ui-heavy
Reason: nav + mobile sheet + existing-screen parity.

Skipped Agents:
| Agent | Skip? | Reason | Safety condition |
|---|---:|---|---|
| pidex-analyst | yes | brief+code give route/nav facts | no unknown API/contract |
| pidex-architect | yes | no cross-boundary architecture | shared layout only |

## Skipped Agents Declaration
Critic/code-review/QA/UAT/devops required. No skip safety violation.

## Retro Mode
Retro Mode: mini
Retro reason: standard UI feature; no rejection/security/process finding in intake.
Post-retro handoffs: none

## Assumptions
- Release line inferred from `dashboard/package.json` version `0.1.0` (roadmap artifact absent in repo).
- Screenshot Artifact Directory: `<pidex-root>/dashboard/.playwright/` only; must be gitignored.

## Constraints and Guardrails
- Scope: `<pidex-root>/dashboard` only.
- Preserve API routes/contracts and top-level content routes.
- Single nav source-of-truth; no per-page duplicate nav definitions.

## UI Intent Boundary
### Must Preserve
- Glass visual language, current route set, legacy `/dashboard/*` redirect behavior.
### May Change
- Header/menu composition point, nav rendering ownership, mobile interaction affordance.
### Forbidden Changes
- API endpoint behavior, route path renames/removals.
### Source-of-Truth Screens / Files
- `routes/dashboard.tsx`, `routes/__root.tsx`, top-level route files in `routes/*.tsx`.

## Existing UI Parity Contract
| Existing behavior/layout | Keep/change? | New mapping | Evidence needed |
|---|---|---|---|
| Desktop glass header nav at `/dashboard` | ADAPT | shared header visible on all target routes | desktop screenshot + route smoke |
| Top-level routes reachable via nav pills | KEEP | same links centralized | click-flow smoke |
| Mobile navigation availability | CHANGE | persistent bottom button + sheet | mobile screenshots + preview |

## UI Label Source Contract
| Surface / element | Visible label | Source-of-truth field/constant | Fallback | Evidence |
|---|---|---|---|---|
| Header/Desktop nav item | Overview/Runs/Tokens/Pipelines/Quality/Analysis/Live/Limits | shared nav config constant | none | screenshot + route click |
| Mobile sheet nav item | same as desktop labels | same shared nav config constant | none | screenshot + route click |
| Mobile trigger | Menu | shared component label constant | "Open menu" aria-label | a11y check |

## Architecture and Integration Notes
Exact files (implementation targets):
- `routes/__root.tsx`
- `routes/dashboard.tsx`
- `routes/live.tsx`, `routes/overview.tsx`, `routes/analysis.tsx`, `routes/runs.tsx`, `routes/tokens.tsx`, `routes/pipelines.tsx`, `routes/quality.tsx`, `routes/limits.tsx`
- `app/styles/theme.css`
- new shared UI files under `components/` and/or `app/` (implementer decides).

## Vertical Slice Plan
1. Slice 1 tracer: shared nav model + shared shell mount (`/dashboard` + `/live`) proving persistent header.
2. Slice 2: mobile bottom button + sheet/drawer behavior + close-on-nav.
3. Slice 3: rollout remaining routes; remove duplicate page-local header/nav.
4. Slice 4 mechanical: docs/version artifacts and evidence capture; include Fallow/FALLOW-SKIP declaration.

## Testing Strategy
**Gate G9**: required — user-visible navigation + mobile UI behavior changed.
- Expected types: unit/integration for shared nav model + interaction state; browser smoke for route/nav flows.
- Accessibility verification: labels, focus order, ESC/close, focus return, 44px touch target minimum.
- No QA test-case prescription in plan.

## UI Quality Contract
### Screenshot Matrix
| Screenshot ID | Surface/route | Viewport | State | Required evidence | Owner |
|---|---|---|---|---|---|
| SS-1 | `/dashboard` | 1280x720 | header + desktop nav visible | image in `.playwright/` | pidex-qa |
| SS-2 | `/live` | 375x812 | bottom button visible, sheet closed | image | pidex-qa |
| SS-3 | `/live` | 375x812 | sheet open with nav links | image | pidex-qa |
| SS-4 | `/overview` | 375x812 | post-nav sheet closed | image | pidex-qa |

### Mobile UI Contract
| Surface | Viewport | Layout behavior | Interaction/touch behavior | Keyboard/overlay/safe-area behavior | Evidence |
|---|---|---|---|---|---|
| Bottom menu trigger | 375x812 | fixed visible above safe-area | >=44px target, tap opens sheet | not hidden by viewport inset | SS-2 |
| Nav sheet | 375x812 | overlays content, non-destructive | tap link navigates + closes | ESC/close button/overlay close; focus return | SS-3/SS-4 |

### Accessibility Baseline
| Surface/control | Label/name | Keyboard/focus expectation | Status/error announcement | Contrast/touch target expectation | Evidence |
|---|---|---|---|---|---|
| Mobile trigger button | aria-label Menu/Open menu | Tab reachable, visible focus | expanded state reflected | WCAG AA, >=44px | browser check |
| Sheet close/nav links | accessible text labels | focus enters sheet, exits on close | close state deterministic | WCAG AA | browser check |

## Validation Commands
- `cd <pidex-root>/dashboard && npm run typecheck`
- `cd <pidex-root>/dashboard && npm run build`
- `cd <pidex-root>/dashboard && node --test tests/dashboard-copy-and-interactions.test.mjs`
- `cd <pidex-root>/dashboard && ./start.sh --no-build`
- Runtime smoke: `/dashboard`, `/live`, `/overview`, `/analysis`.
- Playwright browser-level smoke AC: desktop 1280x720 + mobile 375x812, 0 console errors, no overlay-blocked primary nav action.
- JS/TS QA output must state `Fallow` or `FALLOW-SKIP` with reason.

## User Preview Requirement
| Field | Value |
|---|---|
| UI involved | yes |
| Preview required before G4 | yes |
| Preview command | `cd <pidex-root>/dashboard && ./start.sh --no-build` |
| Preview URL/port | `http://pi.lan:18777/dashboard`, `http://pi.lan:18777/live` |
| Routes/screens to inspect | `/dashboard`, `/live`, `/overview`, `/analysis` |
| Mobile viewport needed | yes |

## G9 Applicability Declaration
Required. Reason: shared nav surface and mobile interaction changed.

## Plan Lint Preflight
| Check | Result | Evidence / Action |
|---|---:|---|
| Execution Profile enum | PASS | `ui-heavy` |
| Skipped Agents declaration | PASS | table + safety conditions present |
| Retro Mode consistency | PASS | `mini`; no mandatory-full trigger in intake |
| Target release/version coherence | PASS | `v0.1.0` aligns with dashboard package version |
| G9 applicability | PASS | declared required |
| Artifact path uniqueness | PASS | single context file path |

## Risks and Mitigations
- Duplicate nav logic persists. Mitigate: single shared nav constant.
- Mobile overlay blocks content. Mitigate: Playwright smoke + mobile contract evidence.
- A11y regressions. Mitigate: explicit baseline table + keyboard checks.

## Open Questions
- OPEN QUESTION [CLOSED]: roadmap release file missing; using package release line `v0.1.0` for this scoped dashboard plan.

## Handoff Notes
- Keep WHAT/WHY contract. File placement/mechanics left to implementer.

<!-- ROUTING
verdict: COMPLETE
route_to: pidex-critic
reason: Micro-plan complete; UI contracts, slices, validations, preview/G9 bound.
context_file: <pidex-root>/agents.output/planning/dashboard-global-header-mobile-menu-plan.md
-->