---
title: pidex Wiki — Activity Log
type: log
status: active
created: 2026-05-20
updated: 2026-05-21
tags: [pidex, log]
---

# pidex Wiki — Activity Log

Chronological log of wiki changes. Agents append entries here when they create or update wiki pages.

---

- 2026-05-12: Initialized project wiki.
- 2026-05-12: pidex-implementer completed Plan 4 dashboard-parity-mobile-projects continuation implementation (4 tests green).
- 2026-05-12: pidex-code-reviewer: Plan 4 dashboard-parity-mobile-projects review REJECTED (0 critical/2 major/1 minor findings).
- 2026-05-12: pidex-implementer: Plan 4 dashboard-parity-mobile-projects implementation complete (7 tests green).

- 2026-05-20: Moved Obsidian global/plans into PIDEX wiki plans/ as canonical planning brief location.

- 2026-05-20: Reorganized PIDEX wiki into status/roadmap/initiatives structure with Obsidian frontmatter.

- 2026-05-20: Numbered initiatives by creation/order, archived root migration docs, and split dashboard wiki into its own dashboard/ section.

- 2026-05-20: Added initiatives 013 PIDEX local wiki graph hygiene and 014 project wiki graph conventions with briefs and implementation plans.

- 2026-05-20: Moved finalized initiatives to completed/ and updated project wiki graph convention docs to discuss active-vs-completed structure.

## Navigation

- PIDEX index: [[index]]
- PIDEX status: [[status]]
- PIDEX roadmap: [[roadmap]]
- Active initiatives: [[initiatives/index]]
- Completed initiatives: [[completed/index]]


- 2026-05-20: Ran PIDEX local wiki graph hygiene pass: added navigation sections, dashboard retrospective index, and normalized folder links.

- 2026-05-20: Completed initiative 013 PIDEX local wiki graph hygiene and moved it to completed/.

- 2026-05-20: Added PIDEX wiki operating guide for future traversal/update sessions.

- 2026-05-20: Added instruction impact analysis for project wiki graph conventions with minimal-change recommendations.

- 2026-05-20: Revised initiative 014 implementation plan for minimal-risk order: report-only first, instruction impact review, convention approval, generator/template patches, non-blocking hygiene checks, Homelab pilot.

- 2026-05-20: Completed initiative 014 Phase 0/1: backed up project wikis and wrote read-only graph reports for Homelab, forge.ng, and running-pi.

- 2026-05-20: Completed initiative 014 Phase 2/3 drafts: instruction inventory and project wiki graph convention draft.

- 2026-05-20: Completed initiative 014 Phase 4 minimal generator/template patches; npm run check passed.
- 2026-05-20: Completed Homelab Level 1-2 project-wiki graph pilot: added folder indexes/navigation and wrote after-pilot graph report.
- 2026-05-20: Completed initiative 014 Phase 5: added report-only graph convention diagnostics to PIDEX wiki hygiene audit.
- 2026-05-20: Completed Forge.ng light-touch project-wiki graph pilot; added folder indexes/navigation and committed only pilot-scoped changes.
- 2026-05-20: Created initiative 015 Agent Balance Dashboard plan for estimate-only parallel-provider balance/runway tracking.
- 2026-05-20: Implemented initiative 015 Agent Balance Dashboard with Settings balance snapshots and Usage parallel-agent runway estimates.
- 2026-05-20: Clarified roadmap execution order separately from initiative discovery numbers; moved initiatives 004, 005, and 015 to completed; marked memory hygiene blocked on quality Phase 2.
- 2026-05-20: Marked initiative 001 Wiki Reorganization And Sync and its memory-cleanup/project-sync plan completed; moved initiative 001 to completed and made Quality Rule Learning the next roadmap item.
- 2026-05-20: Added initiative 011 implementation-plan-v2 with explicit Phase 2 order: operator coverage foundation, trace expansion, coordination specs, comparability labels, rule-action impact windows, regression detectors, then dashboard integration.
- 2026-05-20: Added initiative 011 implementation-for-dummies plain-language explainer for the complete quality/rule-learning project.
- 2026-05-20: Implemented Quality Rule Learning Phase 2A first slice: `OpRuleAction` bridge, manual `OpUserCorrection` reporting, `OpQualityReview` trace expectation, tests, and Forge/Homelab/PIDEX validation reports.
- 2026-05-20: Implemented Quality Rule Learning Phase 2A `OpReleaseDecision` manual recorder/reporting with validation, README example, PDQ Markdown section, tests, and Forge/Homelab/PIDEX validation reports.
- 2026-05-20: Implemented Quality Rule Learning Phase 2A `OpContextPack` skeleton: automatic pre-spawn context/task-size event emission, PDQ Context Packs section, tests, and validation reports.
- 2026-05-20: Implemented Quality Rule Learning Phase 2A `OpPreflight` skeleton: automatic `/pidex`/`/pd` kickoff preflight event emission, PDQ Preflight section, tests, and validation reports.
- 2026-05-20: Implemented Quality Rule Learning Phase 2A `OpReview` skeleton for review-class agents; initial Phase 2A operator coverage is complete and initiative advanced to Phase 2B.
- 2026-05-20: Implemented Quality Rule Learning Phase 2B expected trace expansion with post-cutoff expectations for `OpContextPack`, `OpReview`, and `OpPreflight`; Forge/Homelab reports remain zero-gap.
- 2026-05-20: Implemented Quality Rule Learning Phase 2C-F foundations: coordination specs, comparability labels, rule-action impact windows, and first regression detectors; Phase 2G dashboard/API deferred pending new-run stabilization.
- 2026-05-20: Softened PIDEX pre-spawn context-pack helper instructions because `scripts/pre-spawn/spawn-with-budget.sh` is a Running Pi leftover not currently present in PIDEX; added deferred context-budget-helper brief under initiative 012 for after Phase 2 stabilization.
- 2026-05-21: Created `papers/` paper-analysis workflow, copied `2605.18747v1.pdf`, and wrote Code as Agent Harness analysis with PIDEX improvement findings.
- 2026-05-22: Added initiative 016 Windows Compatibility Analysis brief to audit WSL2, Git Bash, and native PowerShell readiness before making Windows support claims.
- 2026-05-22: Added initiative 016 Pi compatibility-first notes: PIDEX Windows analysis should start from Pi's own Git Bash/shellPath support contract and implementation lessons.
- 2026-05-22: Added initiative 016 compatibility preservation requirement: Windows-support work must prove all current Linux/direct-mode PIDEX features remain working or intentionally unchanged.
- 2026-05-22: Drafted initiative 016 implementation plan with phases for Linux baseline freeze, Pi Windows baseline, entrypoint inventory, static portability audit, compatibility matrix, smoke tests, docs proposal, and later implementation slices.
- 2026-05-22: Adapted initiative 016 plan to start with Milestone A: documentation plus read-only Windows audit only, explicitly forbidding changes to existing runtime paths in the first milestone.
- 2026-05-22: Added initiative 016 platform separation principle: keep Linux/direct-mode files canonical and add separate Windows entrypoints/wrappers/rules wherever possible.
- 2026-05-22: Reconciled initiative 016 brief/plan: Milestone A docs/audit is explicitly not runtime support implementation, and Phase 6 now refines Milestone A docs using compatibility evidence.
- 2026-05-22: Strengthened initiative 016 platform separation language: Windows support must default to separate Windows-owned files, and Windows-driven edits to Linux-owned runtime files require explicit exception review and regression proof.
