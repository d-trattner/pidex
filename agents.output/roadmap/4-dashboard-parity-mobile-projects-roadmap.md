# Dashboard parity · mobile / project selector roadmap record

## Header
- Last Updated: 2026-05-13T00:00:00Z
- Roadmap Owner: pidex-roadmap
- Plan ID: 4 | UUID: 5098e241 | Lane: epic-lane
- Strategic Vision: restore trusted dashboard triage across mobile and desktop with shared project-scoped state and historical quality/token visibility.

## Change Log
| Date & Time | Change | Rationale |
|---|---|---|
| 2026-05-12T20:00:12Z | Closed roadmap record for plan 4 and marked primary epic Delivered (local) | UAT approval + security/QA evidence + devops local readiness with explicit HELD release status |
| 2026-05-12T20:00:12Z | Added backlog follow-ups from retro/PI and future-quality-metrics epic | Retro and PI surfaced recurring pipeline process gaps and new quality learning need |
| 2026-05-13T00:00:00Z | Added provider-limits weekly forecast + visualization epic | User needs weekly Codex/Codex Spark visibility, progress bars, burn-rate forecast, and weekly usage chart |

## Release: v0.1.0 (Local hold)
- Target Date: 2026-05-12 (pipeline completion)
- Strategic Goal: enable one consistent dashboard flow for project-scoped triage, mobile quality readability, and token history without changing dashboard identity.

### Epic
- **Priority:** P0
- **Status:** Delivered
- **User Story:** As a dashboard operator, I want mobile-readable Quality diagnostics, shared project-scoped views, and historical token pagination so I can triage health quickly from any route and device.
- **Business Value:** Faster incident triage, consistent scope comparison, reduced friction switching projects, and lower risk of missing older quality regressions.
- **Dependencies:** `agents.output/planning/4-dashboard-parity-mobile-projects-plan.md`, `agents.output/uat/4-dashboard-parity-mobile-projects-uat.md`, `agents.output/uat/4-dashboard-parity-mobile-projects-g9-fix2-uat.md`, `agents.output/qa/4-dashboard-parity-mobile-projects-qa.md`, `agents.output/security/4-dashboard-parity-mobile-projects-security-v3.md`, `agents.output/devops/4-dashboard-parity-mobile-projects-devops.md`.
- **Acceptance Criteria:**
  - `/quality` mobile card parity restored and visible in G9 screenshot evidence.
  - Global project selector with `All projects` and URL-backed scope behavior.
  - Routes `overview`, `runs`, `pipelines`, `quality`, `tokens`, `live` reflect project scope.
  - Tokens weekly/monthly pagination with `Older/Newer` navigation and metadata behavior.
- **Constraints:** no route redesign, no full old-dashboard recreation, no local push/tag without explicit user release decision.
- **Status Notes:** G9 approved after mobile Quality fix2; devops confirmed upstream bind and API route reachability; release disposition remains HELD (local readiness only, no push).

## Backlog / Future consideration
- P0 / Planned — **QA status reconciliation workflow**: keep QA artifact status and evidence in-sync whenever late browser/blocker updates arrive.
- P0 / Planned — **UI-heavy preflight hard-stop**: block `ui-heavy` plans with unsupported or missing profile enum before critique handoff.
- P1 / Planned — **Security dependency preflight**: require supply-chain/version sanity check before implementation starts in affected plans.
- P1 / Planned — **Route/API parity smoke matrix before code-review**: enforce project and token-page checks for planned surfaces (`/live`, `/tokens`, weekly/monthly pagination, project-switch state reset).
- P1 / Planned — **Responsive proof by computed layout/cascade assertions**: test visual behavior outcome, not selector presence only.
- P1 / Planned — **Provider-limits weekly forecast + visualization epic**: extend `/limits` beyond daily `codex`/`codex-spark` rows to include weekly windows, progress bars, burn-rate forecasts, and weekly usage line chart with forecast marker (`agents.output/briefs/dashboard-provider-limits-weekly-forecast-epic.md`).
- P2 / Planned — **Orchestration quality metrics epic**: ingest structured pipeline-quality score per run, render dashboard quality trend, and overlay improvement-point markers tied to PI outcomes (`agents.output/briefs/dashboard-orchestration-quality-metrics-epic.md`).

## Active Release Tracker
- Current Working Release: v0.1.0

| Plan ID | Release | Lane | Status | Release State |
|---|---|---|---|---|
| 4 | v0.1.0 | epic-lane | Delivered | HELD (local readiness, no release action executed) |

## Previous Releases
- v0.1.0: HELD (evidence-complete, not published)
