---
ID: 1
Origin: 1
UUID: a1b2c3d4
Status: Completed
Target Release: v0.1.0
Epic: JUNK 1-3
---

## Value Statement and Business Objective
As an engineering implementer, I want to complete JUNK 1–3 from `basis.md` in `<pidex-root>`, so that repo bootstrap is production-safe from first commit with Codex-ready role/rule artifacts and no leftover runtime state.

## Objective
Deliver three end-to-end slices covering:
1) repo basis + safety guardrails, 2) agent prompt copy + naming normalization, 3) rules/templates copy + role-reference normalization.

## Requirements and Assumptions
- Source paths exist: `<running-pi-root>/agents`, `<running-pi-root>/rules`, `<home>/obsidian-wikis/pidex/plans/basis.md`.
- Target path `<pidex-root>` is the active working repo.
- Scope is file-system bootstrap only; implementation behavior outside copied content is out of scope.
- Target release artifact is initial baseline milestone; set as `v0.1.0` unless roadmap adds stricter lane version.

## User Preview Requirement

| Field | Value |
|---|---|
| UI involved | no |
| Preview required before G4 | no |
| Preview command | none |
| Preview URL/port | none |
| Routes/screens to inspect | none |
| Mobile viewport needed | no |

## Execution Profile

Profile: standard-feature
Reason: bootstrap plan impacts multiple core role/docs surfaces used by future execution; full quality review required before implementation.

Skipped Agents: none — standard feature profile requires full listed pipeline.

### Retro Mode

Retro Mode: none
Retro reason: small-file bootstrap with no release artifact changes, no known quality/security incidents.
Post-retro handoffs: none

## Plan
### Slice 1: Tracer Bullet — Repo-Basis + Schutz
Objective: create minimal pidex-safe repository root and prove sensitive-state hygiene contract.
- Create/verify root files: `.gitignore`, `.git/init`, `LICENSE`, `NOTICE`, short `README.md`.
- Ensure `.gitignore` blocks sensitive runtime/state paths under repo root.
- Validate `<pidex-root>` contains no tracked `state/runs`, `state/metrics`, `state/pipeline-events` after this slice.
- Dependencies: none.
- Acceptance criteria:
  1. Fresh clone-like baseline can be described by files above.
  2. No sensitive runtime/state artifacts are added during baseline creation.

Owner: rp-implementer

### Slice 2: Agent Prompts Copy + Rename
Objective: replicate agent prompt contract with pidex naming.
- Copy every `<running-pi-root>/agents/rp-*.md` file to `<pidex-root>/agents/pidex-*.md`.
- Normalize file content in copies: all role references `rp-...` -> `pidex-...`.
- Dependencies: Slice 1 complete and source agent tree available.
- Acceptance criteria:
  1. `ls agents/` in target contains pidex-prefixed counterparts.
  2. No functional duplicate names remain as `rp-*.md` in `<pidex-root>/agents`.

Owner: rp-implementer

### Slice 3: Rules + Templates Copy + Rename
Objective: port role-rule ecosystem so each copied role has matching pidex rule basis.
- Copy `<running-pi-root>/rules/rp-*/*` to `<pidex-root>/rules/pidex-*/*`.
- Copy templates tree into `<pidex-root>/templates/*` if missing in target.
- Normalize copied rule/template content from `rp-*` role references to `pidex-*`.
- Dependencies: Slice 2 complete and source rules/templates tree available.
- Acceptance criteria:
  1. For each source agent role copied in Slice 2, corresponding rule docs exist in target.
  2. Active copied rule/template docs contain no active `rp-` role references.

Owner: rp-implementer

### Slice 4: Mechanical closeout
Objective: preserve plan traceability and handoff quality.
- Record final verification summary and unresolved risk notes in this plan.
- Version-management step: none; no package or release files changed in JUNK 1–3 scope.
- Dependencies: completion of Slices 1–3.

Owner: rp-implementer

## Testing Strategy
- Unit/integration/e2e tests: not applicable (artifact bootstrap, no executable product logic).
- Static verification: directory/inventory scans and targeted content checks.
- Critical scenarios: all source files copied; all target references normalized from `rp-` to `pidex-`; no sensitive state files in repo root.

## Validation
- Structural verification: source/target tree diff inventory; required-file presence check.
- Static content verification: grep-based scan for forbidden active references (`running-pi`, `rp-`) in copied bootstrap artifacts.
- Hygiene verification: confirm blocked/excluded state patterns in target root and `.gitignore` coverage.
- Handoff evidence: list of missing files, normalization exceptions, and manual review notes.

## Risks
- Hidden or nested agent/rules files outside assumed glob paths.
- Legacy hardcoded references inside templates requiring manual normalization.
- Mismatch between copied role set and rule set (missing rule coverage).

## Open Questions
- OPEN QUESTION [RESOLVED]: none; no blockers remain.

<!-- ROUTING
verdict: COMPLETE
route_to: rp-critic
reason: Scope-limited bootstrap plan complete; no unresolved OPEN QUESTION remains for critic handoff.
context_file: agents.output/planning/1-implement-junk-1-3-pidex-setup.md
--> 
