---
name: angular-application
description: Build, extend, modernize, debug, test, review, or architect Angular applications and Angular/Nx workspaces. Uses the pinned official Angular developer corpus with conditional Angular Material 3 and Nx monorepo profiles, then adds PIDEX scale routing, project boundaries, and completion evidence. Use for Angular components, signals, forms, routing, SSR, Material/CDK, Nx apps/libraries, generators, affected tasks, migrations, testing, and accessibility.
license: MIT; bundled upstream material retains its own attribution
compatibility: Requires a trusted project and Node.js. Angular 22 supports Node ^22.22.3, ^24.15.0, or ^26.0.0. Module mechanics require an enabled pidex.angular module.
metadata:
  version: '0.1.0'
  upstream-angular-major: '22'
---

# Angular Application

One user-facing skill combines a pinned official Angular technical base with conditional Material and Nx profiles. PIDEX adds orchestration and evidence; it does not replace official framework guidance.

## Mandatory module gate

Before applying this optimization layer, run the module through the stable capability runner from the PIDEX root:

```bash
node scripts/modules/run-check.mjs --capability angular.source-check --agent orchestrator --phase preflight --project <absolute-project-root>
node scripts/modules/run-check.mjs --capability angular.inspect --agent orchestrator --phase preflight --project <absolute-project-root> -- --resolve-nx
```

Use the actual current agent/phase when not orchestrating. If `pidex.angular` is disabled, unavailable, or source verification fails, stop using this skill's optimization rules and report the degraded state. Do not bypass the module runner or call module implementation scripts directly.

## Source hierarchy

Use sources in this order:

1. User requirements and established project conventions.
2. Actual installed Angular, Material/CDK, Nx, TypeScript and Node versions.
3. Pinned official references under `references/official-angular/`, `references/official-material/`, and `references/official-nx/`.
4. PIDEX optimization references under `references/optimization/`.
5. Task-specific current official documentation only when the pinned corpus is insufficient.

Never use MCP, WebMCP, generated Angular/Nx AI-config, or competing skill packs in this workflow.

## Route the task

Read [task-router.md](references/optimization/task-router.md), then classify:

- new application/workspace;
- feature or change;
- modernization/migration;
- defect/debugging;
- tests/quality;
- architecture.

Classify scale:

- **S:** focused component, route, service, or form;
- **M:** several features/routes and shared UI/data code;
- **L:** multiple domains/libraries, SSR or equivalent operational complexity;
- **XL:** Nx Angular multi-app/multi-library workspace or major migration.

Load only relevant references. Do not load L/XL material for an S task.

## Official Angular base

Read [angular-developer.md](references/official-angular/angular-developer.md). Load its referenced topic files only when needed. PIDEX exclusions in this entry skill override upstream mentions of MCP, global installation, generated AI-config, or moving versions. For greenfield creation read the constrained [new-application procedure](references/optimization/new-application.md); the original official `angular-new-app` file is retained for provenance but is not an executable workflow.

Always inspect the workspace version before advising. Preserve existing architecture/forms/builders unless modernization is explicitly selected.

## Conditional Material profile

Activate when Material/CDK is installed or the user selects Material Design. Read:

- [Material profile](references/optimization/material-profile.md)
- [Official Material 22 reference](references/official-material/material-22.md)

Use Material 3 token/theming APIs, component/CDK harnesses, documented accessibility behavior, and strong focus indicators. Do not style private Material DOM/classes. Material is not a dependency default for unrelated Angular projects.

## Conditional Nx profile

Activate when `nx.json`, `nx`, or `@nx/angular` is detected, or when the user requests an Nx monorepo. Read:

- [Nx Angular profile](references/optimization/nx-angular-profile.md)
- relevant files under `references/official-nx/`

Use resolved Nx project configuration and graph output, generators, declared/inferred targets, tags/boundaries, and affected analysis. Do not assume `project.json` is complete. Nx MCP, Nx Cloud automation, self-healing CI, and generated agent configuration are excluded.

## Implement and verify

- Prefer workspace-local Angular/Nx CLI and official generators.
- Any networked dependency/scaffolding action requires explicit user authority and exact versions.
- Keep changes local to the selected project and preserve unrelated code/configuration.
- Use strict typing, modern version-correct Angular patterns, accessibility, and proportional architecture.
- Run the smallest relevant verification first, then broader gates proportional to risk:

```bash
node scripts/modules/run-check.mjs --capability angular.verify --agent pidex-implementer --phase implementation --project <absolute-project-root> -- --operation build
```

For Nx, add `--project-name <name>` when appropriate or use `--operation affected`. Use PIDEX browser-smoke/G9 and AXE for user-facing UI; compilation alone is not completion.

Read [completion-evidence.md](references/optimization/completion-evidence.md) before declaring completion.

## Improvement discipline

Read [improvement-loop.md](references/optimization/improvement-loop.md) for benchmark/real-run findings. Classify each failure into official-source drift, module mechanics, skill routing, project convention, general PIDEX workflow, application defect, or benchmark defect. Change one optimization variable and rerun the smallest discriminating cohort plus one unaffected regression cohort.

Initiative011 may produce rule findings, but it cannot rewrite this skill or module source automatically.
