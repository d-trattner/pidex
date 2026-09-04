---
name: angular-application
description: Build, extend, modernize, debug, test, review, or architect Angular applications and Angular/Nx workspaces. Uses a pinned official Angular 22 knowledge base and activates Angular Material 3 and Nx Angular guidance only when those technologies are present or requested. Use for Angular components, signals, forms, routing, SSR, Material/CDK, Nx apps and libraries, migrations, testing, and accessibility.
license: MIT; bundled upstream material retains its own attribution
compatibility: Requires a trusted project and Node.js. Angular 22 supports Node ^22.22.3, ^24.15.0, or ^26.0.0. Skill activation requires an enabled pidex.angular module.
metadata:
  version: '0.2.0'
  upstream-angular-major: '22'
  evidence-backed-edge-cases: '2'
---

# Angular Application

One user-facing skill provides the official Angular base and conditionally loads Material or Nx profiles. It is application guidance, not a PIDEX build, test, lint, or benchmark runner.

## Mandatory module gate

Before using this skill, run the two read-only capabilities through the stable PIDEX module runner:

```bash
node scripts/modules/run-check.mjs --capability angular.source-check --agent orchestrator --phase preflight --project <absolute-project-root>
node scripts/modules/run-check.mjs --capability angular.inspect --agent orchestrator --phase preflight --project <absolute-project-root>
```

Use the actual current agent and phase when not orchestrating. If `pidex.angular` is disabled, unavailable, or source verification fails, stop before applying this skill. Do not bypass the module runner or call module implementation scripts directly.

`angular.inspect` only reads bounded workspace metadata to select profiles. It does not run Angular, Nx, build, test, lint, affected, generator, package-manager, Git, or network commands.

## Source hierarchy

Use sources in this order:

1. User requirements and established project conventions.
2. Actual installed Angular, Material/CDK, Nx, TypeScript and Node versions.
3. Pinned official references under `references/official-angular/`, `references/official-material/`, and `references/official-nx/`.
4. Conditional PIDEX profiles under `references/profiles/` and bounded workflow guidance under `references/guidance/`.
5. [Evidence-backed edge cases](references/learned-edge-cases.md), only when that file contains admitted findings relevant to the task.
6. Task-specific current official documentation when the pinned corpus is insufficient.

Never use MCP, WebMCP, generated Angular/Nx AI-config, or competing skill packs in this workflow.

## Select the minimum relevant guidance

Read [task-router.md](references/guidance/task-router.md). Determine whether the task is a new application, feature/change, modernization, defect, test/quality, or architecture task. Keep local work local; do not introduce monorepo or enterprise architecture for a focused change. Read [project boundaries](references/guidance/project-boundaries.md) before changing files or configuration.

## Official Angular base

Read [angular-developer.md](references/official-angular/angular-developer.md), then load only its topic files relevant to the task. PIDEX exclusions in this entry skill override upstream mentions of MCP, global installation, generated AI-config, or moving versions.

Always inspect actual workspace versions before advising. Preserve existing architecture, form style, builders, rendering mode, and package manager unless modernization is explicitly requested.

For greenfield work, use the constrained [new-application procedure](references/guidance/new-application.md). The upstream `angular-new-app` coordinate remains attributed, but its MCP-bearing skill file is not packaged or executable.

## Conditional Material profile

Activate only when Material/CDK is installed or the user explicitly selects Material Design. Read:

- [Material profile](references/profiles/material.md)
- [Official Material 22 reference](references/official-material/material-22.md)

Use current Material 3 theming and token APIs, documented accessibility behavior, strong focus indicators, and component/CDK harness guidance. Do not style private Material DOM or classes. Material is not a default dependency for unrelated Angular projects.

## Conditional Nx profile

Activate only when `nx.json`, `nx`, or `@nx/angular` is detected, or when the user requests an Nx workspace. Read:

- [Nx Angular profile](references/profiles/nx-angular.md)
- only the relevant files under `references/official-nx/`

Respect inferred targets, project graph, generators, tags and boundaries, and affected analysis. Use workspace-local Nx commands only when the task itself requires them and the user has authorized the operation. Nx MCP, Nx Cloud automation, self-healing CI, and generated agent configuration are excluded.

## Work in the application, not through a PIDEX test framework

Use the project's existing tools and normal coding-agent command facilities. Prefer the smallest relevant project-native check, then broader checks proportional to risk. Do not install dependencies, scaffold, migrate, or use networked commands without explicit user authority and exact versions.

PIDEX supplies no Angular build/test/lint/affected executor. Report only checks that actually ran; never invent coverage or infer product correctness from compilation alone.

## Learned edge cases

The official base and conditional profiles are available now. Test-derived PIDEX edge cases are a separate evidence layer. Load the evidence-backed edge-case file when implementing Angular Router leave decisions or dirty-state guards, and when a signal store combines asynchronous snapshots with optimistic, committed, or live local mutations.

For a matching asynchronous-snapshot task, do not report completion unless every load captures a store mutation revision/cursor and its completion explicitly rejects or rebases the snapshot when accepted mutations occurred after that capture. A route/request generation guard alone is insufficient because it does not preserve newer local state.

Future edge-case guidance must satisfy the admission requirements in [learned-edge-cases.md](references/learned-edge-cases.md). Initiative011 may identify candidates but cannot rewrite this skill automatically.
