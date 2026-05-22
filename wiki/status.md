---
title: PIDEX Work Status
type: dashboard
status: active
created: 2026-05-20
updated: 2026-05-20
tags: [pidex, status, planning]
---

# PIDEX Work Status

Human entrypoint for PIDEX planning. Initiative folder numbers are **discovery order only**. Actual execution order lives in [[roadmap]].

## Current Roadmap Order

| Order | Initiative | Status | Next action |
|---:|---|---|---|
| 1 | [[initiatives/011-quality-rule-learning/index|Quality Rule Learning]] | `in-progress` | Phase 2A-F foundations implemented; stabilize reports on new real post-Phase-2A pipelines before dashboard/API integration or memory hygiene. |
| 2 | [[initiatives/008-memory-hygiene-skill/index|Memory Hygiene Skill]] | `blocked` | Wait for first Phase 2 quality foundation, then implement as PDQ/ledger consumer. |
| 3 | [[initiatives/014-project-wiki-graph-conventions/index|Project Wiki Graph Conventions]] | `planned` | Define conventions after memory hygiene shape is clear. |
| 4 | [[initiatives/012-reliability-modules/index|Reliability Modules]] | `planned` | Define module taxonomy and mechanism levels before toggles. |
| 5 | [[initiatives/007-context-dashboard-editor/index|Context Dashboard Editor]] | `deferred` | Re-evaluate after context/memory governance is settled. |

## Active / Not Finalized

| Initiative | Status | Why / result | Next action |
|---|---|---|---|
| [[initiatives/011-quality-rule-learning/index|Quality Rule Learning]] | `in-progress` | Phase 2A-F foundations are implemented: operator coverage, post-cutoff trace expansion, coordination specs, comparability labels, rule-action impact windows, and first regression detectors. | Stabilize with new real pipelines; defer Phase 2G dashboard/API until JSON shape proves stable. |
| [[initiatives/008-memory-hygiene-skill/index|Memory Hygiene Skill]] | `blocked` | Project session memory direction exists, but safe implementation depends on Phase 2 quality primitives. | Resume after first Phase 2 foundation has stable evidence. |
| [[initiatives/014-project-wiki-graph-conventions/index|Project Wiki Graph Conventions]] | `planned` | Design PIDEX-maintainable graph conventions for managed project wikis. | Inspect current wiki-writing instructions before project edits. |
| [[initiatives/012-reliability-modules/index|Reliability Modules]] | `planned` | Cost-aware reliability modules, drift prevention, and module taxonomy. | Discuss what qualifies as a module and baseline protection before implementing toggles. |
| [[initiatives/007-context-dashboard-editor/index|Context Dashboard Editor]] | `deferred` | Dashboard context editing capability. | Re-evaluate against current dashboard priorities before implementation. |
| [[initiatives/016-windows-compatibility-analysis/index|Windows Compatibility Analysis]] | `planned` | Public users may ask whether PIDEX runs on Windows; current support expectations are Linux/WSL-shaped and need evidence. | Execute Milestone A: add Windows status docs and a read-only compatibility audit only, with no changes to existing runtime paths. |

## Finalized / Shipped

| Initiative | Status | Why / result | Next action |
|---|---|---|---|
| [[completed/001-wiki-reorganization-and-sync/index|Wiki Reorganization And Sync]] | `finalized` | Memory cleanup/project sync plan and wiki planning structure completed. | Use status/roadmap/initiatives/completed as the planning workflow. |
| [[completed/002-wiki-hygiene-agent/index|Wiki Hygiene Agent]] | `finalized` | Project wiki hygiene audit agent and reports. | Use for project wiki audits; keep improving via rule hygiene phase. |
| [[completed/003-grill-with-docs-onboarding/index|Grill With Docs Onboarding]] | `finalized` | Existing-project grilling/onboarding workflow. | Use during PIDEX pre-flight when project context exists. |
| [[completed/004-project-boundary-and-metadata/index|Project Boundary And Metadata]] | `finalized` | Project boundary guard and project-local metadata/context folder conventions shipped. | Monitor for package-layout drift. |
| [[completed/005-security-hooks/index|Security Hooks]] | `finalized` | Repo-local/global/Pi-extension security hook directions shipped. | Revisit only if public-release hardening changes hook needs. |
| [[completed/006-optional-parallel-agents/index|Optional Parallel Agents]] | `finalized` | Optional parallel critic/reviewer lanes with provider/model config. | Measure ROI and keep configurable. |
| [[completed/009-public-readiness/index|Public Readiness]] | `finalized` | Public package readiness and publish-prep work. | Manual GitHub visibility/publication decision remains operator-owned. |
| [[completed/010-stage2-resume-continuation/index|Stage2 Resume Continuation]] | `finalized` | Stage2 resume / exit-143 continuation follow-up. | No active next step unless regression appears. |
| [[completed/013-pidex-local-wiki-graph-hygiene/index|PIDEX Local Wiki Graph Hygiene]] | `finalized` | PIDEX local wiki graph hygiene pass completed with zero ambiguous/missing links and navigation sections on all pages. | Continue with project-wiki graph conventions separately in 014. |
| [[completed/015-agent-balance-dashboard/index|Agent Balance Dashboard]] | `finalized` | Estimate-only dashboard feature for parallel-agent provider balances shipped. | Monitor first live pipeline estimates. |

## Filing Rules

- New idea/brief: create or update an initiative under `initiatives/`.
- Unsure where it belongs: put it in `inbox/` and classify later.
- Completed work: add/update outcome or implementation summary, then move to `completed/` when finalized.
- Avoid recreating flat `plans/` files.

## Navigation

- PIDEX index: [[index]]
- PIDEX roadmap: [[roadmap]]
- Active initiatives: [[initiatives/index]]
- Completed initiatives: [[completed/index]]
