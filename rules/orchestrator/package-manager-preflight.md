# Package Manager Preflight

PROC-PACKAGE-MANAGER-5

## Rule

Before spawning planner/implementer work for JavaScript/TypeScript projects, classify package-manager context.

## Greenfield projects

For brand-new JS/TS projects created by PIDEX:

- default package manager: pnpm;
- ask only if the user has a known npm constraint or requests another manager;
- yarn/bun are unsupported unless future support is explicitly added.

## Existing projects

For existing projects:

- detect current package manager when possible;
- keep npm projects on npm compatibility path unless user explicitly requests migration;
- keep pnpm projects on pnpm;
- if no evidence is found, classify as unknown and ask/record the decision before dependency/script commands;
- if yarn/bun is detected, stop or route to a plan that explicitly handles unsupported package manager status.

## Handoff evidence

Planner/implementer briefings for JS/TS work should include:

```text
Package manager context:
- Mode: greenfield|existing
- Detected/intended manager: pnpm|npm|yarn|bun|unknown
- Support mode: supported|compatibility|unsupported|unknown|conflict
- Migration requested: yes|no
```
