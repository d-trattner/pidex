# Rule: Dep-Pruning Slice Lockfile Regeneration

PROC-NEW-23 | pidex-implementer

## Rule

**Any slice that removes packages from `package.json` is not complete without lockfile regeneration in the same slice.**

Removing packages from `package.json` without regenerating the detected lockfile leaves the lockfile stale. Removed packages remain pinned in the lockfile with any associated CVEs — meaning security scanners will still flag them.

Also follow [Package Manager Equivalence](../shared/package-manager-equivalence.md): pnpm is PIDEX's native/default manager, existing npm projects use the compatibility path, and lockfile type must not change unless migration is explicit.

## Required steps (in order)

When a slice removes one or more packages from `package.json`:

1. Detect package manager / lockfile type.
2. Edit `package.json` to remove the packages, or run the detected package-manager remove/uninstall command.
3. Regenerate the lockfile using the detected package-manager equivalent:
   ```bash
   # pnpm project
   rm -rf node_modules pnpm-lock.yaml
   pnpm install

   # npm compatibility project
   rm -rf node_modules package-lock.json
   npm install
   ```
4. Run the detected audit equivalent (`pnpm audit --audit-level moderate` or `npm audit --audit-level=moderate`) to verify no new critical/high CVEs introduced.
5. Stage and commit both `package.json` AND the detected lockfile in the same commit.

## The lockfile is a deliverable of the dep-pruning slice

The slice is not "done" after `package.json` is edited. The detected lockfile (`pnpm-lock.yaml` or `package-lock.json`) is an implicit deliverable of every dep-pruning slice. Omitting it from the commit = incomplete slice.

## Scope

Applies when a slice:
- Runs a package-manager remove/uninstall command
- Removes a dependency from the `dependencies`, `devDependencies`, or `peerDependencies` field of any `package.json`
- Removes a workspace package that other packages depended on

Does NOT apply to pure version bumps (no removal) — those are upgrade slices, not dep-pruning slices.

## Empirical basis

Plan 34 (plan-d-nextjs-removal): S4 pruned `next`, `eslint-config-next`, and `tailwindcss@^3.x` from root `package.json` but did not regenerate the lockfile. pidex-security caught the stale lockfile's CVEs as finding F-1. pidex-devops Stage 1 regenerated it as a dedicated unplanned step. Both the security finding and the Stage 1 fixup were avoidable if S4 had included lockfile regen as an explicit step.
