# Version Bump Policy: apps/web-only (Post-Plan D)

**PROC-NEW-41a** | Added: 2026-04-26 | Plan 41 evidence

## Rule

Since the Plan D (Next.js removal, v0.9.0 final) monorepo restructure, version bump scope is **apps/web only**:

- Bump: `apps/web/package.json` version field
- Bump: shell.tsx APP_VERSION constant
- DO NOT bump: root `package.json` (stays at 0.9.2 until a monorepo-scope version policy change is planned)
- DO NOT bump: `packages/core/package.json` unless core API has breaking changes in this plan

## Why

Root `package.json` tracked a unified monorepo version in the pre-Plan-D era. Since Plan D removed `apps/next` and the monorepo root now has no independent release cadence, bumping root with every web feature release is noise. The post-Plan D convention was established organically starting with v0.9.2 and has been correct in every plan since. The concept doc `version-bump-file-surface.md` describes the pre-Plan-D four-file pattern and should be treated as legacy context.

## What pidex-planner must do

In any plan that includes a version bump slice:
1. List only `apps/web/package.json` in the File Surface row for the version bump
2. Do NOT list root `package.json` as a version bump target
3. If a plan author believes root should also be bumped, add an explicit §Version Policy Exception section and flag for pidex-critic

## What pidex-critic must do

If a plan lists root `package.json` in a version bump slice without an explicit §Version Policy Exception section, raise a LOW finding:
"Root package.json listed for version bump without exception rationale. Post-Plan-D policy is apps/web only. Add §Version Policy Exception or remove root from scope."
