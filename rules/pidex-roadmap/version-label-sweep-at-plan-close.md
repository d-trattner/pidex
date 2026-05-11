# Rule: Version Label Sweep at Plan-Close

**PROC-NEW:** 47-2
**Applies to:** pidex-roadmap (post-devops handoff)
**Added:** 2026-04-28

## Rule

After pidex-devops closes a plan and tags a version, pidex-roadmap **must** sweep `product-roadmap.md` for stale or duplicate version section headers **in the same post-retro handoff run** — not deferred to a later session.

## Sweep Procedure

1. Search `product-roadmap.md` for all `## Release v<X.Y.Z>` section headers.
2. Identify duplicate headers (two sections with the same version string).
3. Identify stale headers (version string that was claimed by a plan that has since shipped a different version).
4. For each stale/duplicate:
   - Update the header to the correct version the epic will ship as.
   - If the correct target version is unknown, label the section `## Release v<TBD> — <epic-name>` until planning determines the version.
5. Commit the roadmap update.

## Trigger

This sweep is mandatory whenever:
- pidex-devops closes a plan (new version tagged), OR
- pidex-roadmap is invoked as a post-retro handoff agent.

## Why This Matters

Duplicate version labels in the roadmap are the root cause of C-1 class critique findings. When a new plan targets a version that exists as a roadmap section, the planner copies the version from the roadmap header. If the header is stale (from an earlier plan that shipped a different version), the new plan inherits the stale label — triggering a critique CRITICAL that requires orchestrator intervention.

**Anti-pattern (Plan 47):** Two `## Release v0.9.8` sections existed in the roadmap after Plan 44 shipped. Plan 47's planner picked up `v0.9.8` from the HA section header; the plan actually shipped as `v0.10.1`. C-1 was avoidable with a sweep at Plan 44's close.

## Rationale

Validated in Plan 47 retrospective (PROJ-47-C). Fix is low-cost (header rename), happens naturally at roadmap update time, and prevents a recurring class of critique CRITICAL findings.
