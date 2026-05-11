# Rule: Dep-Pruning Slice Lockfile Regeneration

PROC-NEW-23 | pidex-implementer

## Rule

**Any slice that removes packages from `package.json` is not complete without lockfile regeneration in the same slice.**

Removing packages from `package.json` without regenerating the lockfile leaves the lockfile stale. The removed packages remain in `package-lock.json` with their pinned versions and any associated CVEs — meaning security scanners will still flag them.

## Required steps (in order)

When a slice removes one or more packages from `package.json`:

1. Edit `package.json` to remove the packages (or run `npm uninstall <pkg>`).
2. Run lockfile regeneration:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
3. Run `npm audit` to verify no new critical/high CVEs introduced.
4. Stage and commit both `package.json` AND `package-lock.json` in the same commit.

## The lockfile is a deliverable of the dep-pruning slice

The slice is not "done" after `package.json` is edited. `package-lock.json` is an implicit deliverable of every dep-pruning slice. Omitting it from the commit = incomplete slice.

## Scope

Applies when a slice:
- Runs `npm uninstall <pkg>`
- Removes a dependency from the `dependencies`, `devDependencies`, or `peerDependencies` field of any `package.json`
- Removes a workspace package that other packages depended on

Does NOT apply to pure version bumps (no removal) — those are upgrade slices, not dep-pruning slices.

## Empirical basis

Plan 34 (plan-d-nextjs-removal): S4 pruned `next`, `eslint-config-next`, and `tailwindcss@^3.x` from root `package.json` but did not regenerate the lockfile. pidex-security caught the stale lockfile's CVEs as finding F-1. pidex-devops Stage 1 regenerated it as a dedicated unplanned step. Both the security finding and the Stage 1 fixup were avoidable if S4 had included lockfile regen as an explicit step.
