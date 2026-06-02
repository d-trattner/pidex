# Rule: Dep-Pruning Slice Lockfile Check

PROC-NEW-23 | pidex-critic

## Rule

**Flag as BLOCKING any dep-pruning slice that lacks an explicit lockfile regeneration step.**

A dep-pruning slice that only edits `package.json` (removing packages) without specifying detected package-manager lockfile regeneration leaves the lockfile stale. Stale lockfile = removed packages' CVEs persist in the pinned lockfile. pidex-security will catch this, but the critic gate is earlier and cheaper.

## Check

When reviewing a plan that contains a dep-pruning slice (a slice described as "dependency pruning", "remove unused packages", "uninstall X", or equivalent):

1. Find the slice's steps or description.
2. Verify the slice explicitly includes detected package-manager lockfile regeneration, for example:
   - pnpm: `pnpm install` after dependency removal, committing `pnpm-lock.yaml`
   - npm compatibility: `npm install` or `npm uninstall <pkg>`, committing `package-lock.json`
3. Verify the slice's commit step includes the detected lockfile.

If any of these are missing: flag as BLOCKING.

## Finding format

```
Finding: Dep-pruning slice missing lockfile regeneration
Severity: BLOCKING
Slice: <slice name/ID>
Details: Slice removes packages from package.json but does not include lockfile regeneration.
Stale lockfile retains CVEs for removed packages; pidex-security will catch this as a must-fix.
Fix: Add explicit detected package-manager lockfile regeneration step to the slice.
Commit the detected lockfile (`pnpm-lock.yaml` or `package-lock.json`) as part of the same slice.
```

## Scope

Applies to any plan slice that removes packages. Does NOT apply to pure version bumps.

## Empirical basis

Plan 34 (plan-d-nextjs-removal): S4 dep-pruning slice had no lockfile regen step. pidex-security caught CVE F-1 from the stale lockfile. Required an unplanned Stage 1 fix. The critic gate would have caught this earlier with zero pipeline disruption.
