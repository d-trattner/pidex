# Package Manager Lockfile Gate

PROC-PACKAGE-MANAGER-4

## Rule

QA for JavaScript/TypeScript dependency, bootstrap, or package-manager-affecting work must verify package-manager intent matches actual lockfiles.

## Required checks

1. Record detected package manager using the package-manager detector when available.
2. Compare actual lockfiles to the plan/implementation artifact.
3. Fail same-root mixed lockfiles unless package-manager migration was explicitly requested.
4. For greenfield pnpm projects, require `pnpm-lock.yaml` after dependency installation and reject `package-lock.json`.
5. For npm compatibility projects, require `package-lock.json` after dependency installation and reject `pnpm-lock.yaml` unless migration was explicitly requested.
6. For yarn/bun projects, report unsupported package-manager scope instead of executing guessed commands.

## Evidence block

QA artifacts should include:

```text
Package manager QA:
- Plan/intended manager: ...
- Detected manager: ...
- Support mode: supported|compatibility|unsupported|unknown|conflict
- Lockfiles present: ...
- Mixed same-root lockfiles: yes|no
- Verdict impact: pass|fail|blocked|not-applicable
```

## Non-applicable cases

For non-JS/TS work, record:

```text
PACKAGE-MANAGER-SKIP: non-JS/TS scope
```
