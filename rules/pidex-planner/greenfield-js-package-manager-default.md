# Greenfield JS/TS Package Manager Default

PROC-PACKAGE-MANAGER-2

## Rule

For brand-new JavaScript/TypeScript projects that PIDEX creates from scratch, default the package manager to pnpm.

Greenfield means a new project with no existing package-manager policy. Existing repos with no lockfile or `packageManager` field are not greenfield; classify them as unknown and ask/record the package-manager decision.

## Required planner behavior

When planning a new JS/TS project:

1. Add a package-manager decision to the plan.
2. Default to pnpm unless the user explicitly chooses npm.
3. Treat yarn/bun as unsupported for execution unless a future initiative adds support.
4. Include acceptance criteria for lockfile discipline.

## Required plan evidence

Plans for greenfield JS/TS projects must include a line equivalent to:

```text
Package manager: pnpm (greenfield default)
```

If user chooses npm:

```text
Package manager: npm (user override; compatibility path)
```

If target package manager is unclear for an existing project:

```text
Package manager: unknown — detect/ask before dependency or script commands
```

## Acceptance criteria examples

- pnpm project includes root `packageManager` and `pnpm-lock.yaml` after dependency installation.
- npm override project includes `package-lock.json` and no `pnpm-lock.yaml`.
- Same-root mixed lockfiles fail QA unless package-manager migration was explicitly requested.
