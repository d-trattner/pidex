---
ID: 4
Origin: 4
UUID: 70d50d80
Status: OPEN
---

# Provider Limits Native Critique

Plan reference: `agents.output/planning/4-provider-limits-native-plan.md` / ID `4` / UUID `70d50d80`
Date: 2026-05-12
Status: Initial

| date | handoff | request | summary |
|---|---|---|---|
| 2026-05-12 | pidex-critic | Initial plan critique | Rejected: process/profile UI quality gaps block implementation readiness |

## Value Statement Assessment

Pass. User story has As/I want/So that. Outcome matches brief: native provider-limit collection, API/UI rows, no running-pi coupling, no recommendation noise.

Direct value mostly clear. Plan ties probe → state → API → `/limits`. Preserves profiles. Removes recommendation surface.

## Overview

Plan has good functional slices and relevant files. Main product scope fits epic. Blocking issue: required execution profile/retro/user-preview/UI-quality contracts not satisfied. Because plan touches API, filesystem state, and UI table, pipeline risk must be explicit before implementation.

No unresolved open questions in source plan. `Open Questions` says none blocking.

Roadmap note: compact brief says no separate roadmap provided. No `agents.output/roadmap/product-roadmap.md` found. Alignment checked against direct-mode epic brief only.

## Scope Assessment

Scope right-size for epic: probe, API routes, `/limits`, profile preservation, validation. No obvious feature drift.

Hotfix risk: missing explicit API/security profile may skip security review despite API route + filesystem state write/read. Missing UI evidence plan may let `/limits` regress visually or hide empty/error/loading states.

## Technical Debt Risks

- Compatibility routes handled deliberately. Good.
- `recommended_profile` removal includes probe, server, profile alias routes, helper script. Good.
- Provider source discovery remains vague but acceptable as implementation discovery, with analyst escape if unknown.
- Validation checks absence of top-level `recommended_profile`, but does not require recursive/body grep across profile subroutes. Minor only; plan text covers route removal.

## Execution Profile Assessment

Fail. Plan says `direct-mode implementation plan`; required rule expects profile from allowed set: `api-security`, `ui-small`, `ui-heavy`, etc., with skipped-agent table or explicit none.

Correct minimum seems `api-security` because API routes, persistence, filesystem state, and outward response contract change. Also UI changes require designer/QA/UAT consideration. Current skip statement says architect not required, analyst skipped, but lacks safety conditions and omits security/code-review/QA/UAT/designer decisions.

## Retro Mode Assessment

Fail. Plan says `Retro mode: standard`; required values are `none`, `mini`, `full`, with reason and post-retro handoffs. For this scope, likely `mini` unless security/process/release trigger appears.

## Findings

### Critical

#### C1 — Execution profile contract missing

Status: OPEN

Description: Plan does not declare allowed execution profile. It uses `direct-mode implementation plan`, not contract value. Scope touches API routes, filesystem-backed state, server normalization, UI data binding, and POST profile behavior.

Impact: Orchestrator may skip security/code-review/QA/UAT/designer incorrectly. API/filesystem risk can ship without correct gates.

Recommendation: Planner update Execution Profile to allowed profile, likely `api-security` plus UI handling, with skipped-agent table and safety conditions.

#### C2 — Retro mode contract missing

Status: OPEN

Description: Plan uses `standard`, not allowed retro mode. Missing retro reason and post-retro handoffs.

Impact: Closeout pipeline ambiguous. Process findings or release triggers may be lost.

Recommendation: Planner declare `Retro Mode: mini` or `full` with reason and post-retro handoffs.

#### C3 — UI preview contract incomplete

Status: OPEN

Description: Plan has narrative user preview requirement, but not required table. Missing preview command, URL/port, routes/screens, mobile viewport need.

Impact: `/limits` user-visible work can reach release disposition without clear preview setup.

Recommendation: Add User Preview Requirement table. Include dashboard command, URL/port `http://localhost:18777/limits` or TBD, route `/limits`, mobile viewport yes/no.

### Medium

#### M1 — UI screenshot matrix absent

Status: OPEN

Description: `/limits` table/status display changes visible UI. Rule requires screenshot matrix for visible status/table changes. Plan only says open `/limits` and confirm rows.

Impact: QA may miss empty/loading/error/default visual states. User preview gets weak evidence.

Recommendation: Add UI Quality Contract with Screenshot Matrix for loaded records, empty records, loading/error if feasible, desktop viewport at minimum. Mobile only if layout/responsive affected.

### Low

#### L1 — Probe validation does not assert target provider rows when data seeded

Status: OPEN

Description: Validation prints provider set but does not assert `codex` and `codex-spark` under seeded/real data scenario.

Impact: Implementation could pass probe smoke while Spark stays hidden.

Recommendation: Add conditional/fixture-backed validation note: with available or seeded source data, assert both provider IDs pass probe → API → UI.

## Unresolved Open Questions

None.

## Risk Assessment

Product risk low. Process/gate risk high enough to block. Plan substance good, but contract gaps can cause wrong downstream agents and missed UI/API validation.

## Verdict

REJECTED

## Revision History

| revision | date | status | notes |
|---|---|---|---|
| Initial | 2026-05-12 | OPEN | Rejected for execution profile, retro mode, UI preview/screenshot gaps |

<!-- ROUTING -->
verdict: REJECTED
route_to: pidex-planner
context_file: agents.output/critic/4-provider-limits-native-critique.md
gate: G1
reason: plan value/scope good, but required execution-profile, retro, and UI preview contracts missing
<!-- /ROUTING -->
