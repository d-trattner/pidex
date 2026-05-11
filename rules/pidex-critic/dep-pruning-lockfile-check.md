# Rule: Dep-Pruning Slice Lockfile Check

PROC-NEW-23 | pidex-critic

## Rule

**Flag as BLOCKING any dep-pruning slice that lacks an explicit lockfile regeneration step.**

A dep-pruning slice that only edits `package.json` (removing packages) without specifying `npm install` / lockfile regen leaves the lockfile stale. Stale lockfile = removed packages' CVEs persist in the pinned lockfile. pidex-security will catch this, but the critic gate is earlier and cheaper.

## Check

When reviewing a plan that contains a dep-pruning slice (a slice described as "dependency pruning", "remove unused packages", "uninstall X", or equivalent):

1. Find the slice's steps or description.
2. Verify the slice explicitly includes one of:
   - `npm install` (after removing packages)
   - `rm -rf node_modules package-lock.json && npm install`
   - `npm uninstall <pkg>` (which auto-updates lockfile)
3. Verify the slice's commit step includes `package-lock.json`.

If any of these are missing: flag as BLOCKING.

## Finding format

```
Finding: Dep-pruning slice missing lockfile regeneration
Severity: BLOCKING
Slice: <slice name/ID>
Details: Slice removes packages from package.json but does not include lockfile regeneration.
Stale lockfile retains CVEs for removed packages; pidex-security will catch this as a must-fix.
Fix: Add explicit step — rm -rf node_modules package-lock.json && npm install — to the slice.
Commit package-lock.json as part of the same slice.
```

## Scope

Applies to any plan slice that removes packages. Does NOT apply to pure version bumps.

## Empirical basis

Plan 34 (plan-d-nextjs-removal): S4 dep-pruning slice had no lockfile regen step. pidex-security caught CVE F-1 from the stale lockfile. Required an unplanned Stage 1 fix. The critic gate would have caught this earlier with zero pipeline disruption.
