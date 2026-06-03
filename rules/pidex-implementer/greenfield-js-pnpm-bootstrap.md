# Greenfield JS/TS pnpm Bootstrap

PROC-PACKAGE-MANAGER-3

## Rule

When implementing a brand-new JavaScript/TypeScript project and the plan does not specify an explicit npm override, bootstrap with pnpm.

## Required behavior

For greenfield pnpm projects:

1. Add `packageManager` to `package.json` with the pinned pnpm version chosen by the plan or environment decision.
2. Use pnpm commands for dependency install and scripts.
3. Generate/update `pnpm-lock.yaml` when dependencies are installed.
4. Do not create `package-lock.json`.
5. Record package-manager evidence in the implementation artifact.

For explicit npm override projects:

1. Use npm compatibility commands.
2. Generate/update `package-lock.json`.
3. Do not create `pnpm-lock.yaml` unless migration is explicitly requested.
4. Record that npm was a user/plan override.

## Evidence block

Implementation artifacts for JS/TS bootstrap or dependency work must include:

```text
Package manager evidence:
- Detected/intended manager: pnpm|npm|unknown
- Support mode: supported|compatibility|unknown|conflict
- Commands used: ...
- Lockfile touched: pnpm-lock.yaml|package-lock.json|none
- Mixed lockfiles: yes|no
```

## Guard

Do not change package-manager family in an existing project without explicit migration scope.
