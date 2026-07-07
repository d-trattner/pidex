# PIDEX project modes

PIDEX saves one explicit execution mode per project. The mode controls where agents run, which filesystem is canonical, how artifacts are collected, and which mode-native features are available.

Parity means differences are intentional, documented, and tested. It does **not** mean every feature must run in every mode.

## Mode summary

| Mode | Source of truth | Execution model | Best fit |
|---|---|---|---|
| `host-direct` | Host project checkout | Host Pi orchestrator uses `pidex_agent` specialists directly. | Classic PIDEX workflow and low-friction local work. |
| `hardened-pipeline` | Host project checkout | Host orchestration remains active, but selected agents run in a temporary Docker sandbox and changes are extracted/applied. | Source-changing work that needs extra host protection while host source remains canonical. |
| `project-pipeline` | Persistent Docker Project Sandbox `/workspace` | Pi and project source run inside a persistent Docker container; host syncs only artifacts/wiki archive. | Container-first project work, Windows Docker Desktop flows, managed preview, and host browser evidence. |

## Capability matrix

| Capability | `host-direct` | `hardened-pipeline` | `project-pipeline` |
|---|---|---|---|
| Saved per-project mode | Yes | Yes | Yes |
| `/pd` from home/new project interview | Yes | Yes | Yes |
| Specialist phase chain | Host `pidex_agent` handoffs | Host `pidex_agent`; selected agents sandboxed | In-container sequential Project Pipeline orchestrator |
| Source canonical location | Host checkout | Host checkout | Container `/workspace` |
| Source changes returned to host | Direct edits | Patch/apply from temporary sandbox | Not automatic; source remains in Project Sandbox |
| Artifact location | Host project `agents.output/**`, `wiki/**` | Extracted to host project `agents.output/**`, `wiki/**` | Host archive under `state/project-archives/<project-id>/` |
| Artifact browsing | Direct files | Direct files plus sandbox evidence | `/pdproject runs`, `show-run`, `artifacts` |
| Credential model | Host Pi/provider credentials | Host orchestrator credentials; sandbox blocks sensitive host reads | Explicit copied credentials into trusted persistent container secrets volume |
| Delegate/provider routing | Full configured host delegates | Host delegates where applicable; sandboxed agents use wrapper constraints | In-container Pi uses copied config/credentials |
| Parallel secondary lanes | Supported by host orchestrator config | Host path support where applicable | Not currently supported; Project Pipeline is sequential |
| Module capability discovery | Available | Available | Available |
| Module-scoped rule metadata/rendering | Available | Available | Available |
| Live module-rule prompt injection | Not currently injected generically | Not currently injected generically | Yes, Project Pipeline phase prompts with `mode: project-pipeline` filters |
| Managed preview lifecycle | Not managed by PIDEX | Not managed by PIDEX | Yes: `/pdproject preview` and automatic UI preview gates |
| Browser-smoke install/preflight | Available as PIDEX-local host capability | Available as PIDEX-local host capability | Available and integrated with Project Pipeline bridge |
| Browser-smoke automatic request/bridge/verdict loop | Not currently automatic | Not currently automatic | Yes for QA/UAT/devops request artifacts |
| Browser URL source | User/project-owned | User/project-owned | Project Pipeline registry-managed preview URL |
| Sandbox boundary | None beyond policy/tool guards | Temporary Docker workspace, host source protected until apply | Persistent Docker Project Sandbox, archive-only host sync |
| Windows evidence | Experimental/general coverage incomplete | Helper smoke only; needs fresh real scenario | Focused native Windows Docker Desktop `/pd` + managed preview + browser-smoke pass |
| Primary management commands | `/pd`, `/pdq`, `/pdwiki`, `/pdmem`, `/pdparallel` | Same host commands plus sandbox evidence | `/pd`, `/pdproject`, archive helpers; host commands may need mode-aware interpretation |

## Supporting feature mode behavior

These features are not always part of the source-changing agent path, but they are user-visible PIDEX surfaces. The table documents where they read, write, or report today so future changes can avoid accidental mode drift.

| Supporting feature | `host-direct` | `hardened-pipeline` | `project-pipeline` |
|---|---|---|---|
| Project context / grilling | Reads and writes host project `pidex/context/**`; pre-flight may use project docs before planner handoff | Same host project context; sandboxed agent work must treat host context as orchestrator-provided input | Pre-flight and saved project metadata are host-orchestrated; Project Sandbox source is container-canonical, so context/archive semantics need explicit review before mutation-heavy context features |
| Quality reports / PDQ | Reads host PIDEX state, project artifacts, metrics, and rules; writes reports under host PIDEX/report locations | Reads host state plus sandbox evidence where available | Needs archive-aware interpretation for Project Pipeline runs; tracked as Initiative 030 F4 |
| Quality governance / rule learning | Host PIDEX quality state and rule evidence | Host PIDEX quality state plus sandbox run evidence | Host PIDEX quality state; Project Pipeline archive evidence needs explicit data-source mapping |
| Wiki hygiene | Audits host project `wiki/**` and project-local PIDEX rules | Same host project wiki/rules after sandbox extraction | Needs mode-aware decision: Project Sandbox wiki/archive vs host project path; tracked as Initiative 030 F4 |
| Project session memory | Writes host project `wiki/session-memory/**` | Writes host project memory outside temporary sandbox | Needs mode-aware decision: host project memory, Project Pipeline archive memory, or container workspace memory; tracked as Initiative 030 F4 |
| Dashboard views | Host PIDEX dashboard reads host runtime state, metrics, wiki/context summaries, and provider data | Same host dashboard plus any sandbox events that are recorded | Host dashboard reads Project Pipeline archive/state where implemented; unified archive/source UX remains Initiative 030 F7 |
| Provider limits / profiles | Host PIDEX provider governance and profile state | Same host provider governance; sandboxed phases may inherit constrained routing | Host PIDEX profile state plus copied in-container Pi/provider config for Project Sandbox execution |
| History / metrics / recent projects | Host PIDEX metrics/history state records runs and recent projects | Host PIDEX metrics/history plus sandbox warnings/evidence when emitted | Host PIDEX history plus Project Pipeline registry/archive records |
| Host safety / project boundary / Git hooks | Host policy guards and optional global Git hook protect host checkout work | Host guards plus temporary Docker boundary before apply/extract | Host orchestrator guards plus Docker Project Sandbox and archive-only host sync; optional Git hook applies to host repos, not container commits by itself |
| Package-manager helpers | Detect/build commands against host project package root | Host or sandbox package root depending phase wrapper | In-container `/workspace` package root for Project Sandbox work; host helpers remain PIDEX-runtime utilities unless bridged deliberately |
| Browser-smoke runtime maintenance | PIDEX-local host Playwright/cache cleanup and preflight | Same host PIDEX runtime maintenance | Same host PIDEX runtime maintenance plus Project Pipeline bridge/archive cleanup considerations |
| Install / doctor / release readiness | Host PIDEX runtime maintenance, not per-project execution | Same | Same host PIDEX runtime maintenance; Project Sandbox images/volumes are managed separately |

## Intentional differences

- Project Pipeline managed preview is mode-native because the app runs inside Docker and needs registry-owned port/URL handling. Host-direct and hardened-pipeline projects can run dev servers directly unless a future host preview runner is designed.
- Project Pipeline browser-smoke automation is mode-native today because request validation is bound to a registered Project Pipeline archive and managed preview registry URL.
- Hardened-pipeline is temporary protection for selected host-project work. It should not become a persistent source-of-truth container.
- Project Pipeline source is not mirrored back to the host automatically. Use Git/PR/export workflows manually until a future source export feature is designed.
- Not all module-scoped rules should apply to all modes. Rules must declare mode scope when behavior is mode-specific.

## Known open parity decisions

Tracked in Initiative 030 Project Mode Feature Parity:

1. Whether host-direct/hardened should get browser-smoke automation or only generic/manual browser-smoke capability.
2. Whether live module-scoped rule injection should expand beyond Project Pipeline.
3. Whether Project Pipeline should remain sequential-only or support optional parallel lanes.
4. Whether `/pdq`, `/pdwiki`, `/pdmem`, and `/pdparallel` need mode-aware data-source summaries.
5. Whether dashboard, project context, memory, wiki, quality governance, and history views need one common mode-aware data-source contract.
6. Whether a unified mode-aware artifact/status command should exist.
7. Fresh hardened-pipeline validation after the Project Pipeline/browser-smoke work.

## Rule for future feature changes

Any feature touching `/pd`, `pidex_agent`, artifacts, preview, browser-smoke, credentials, modules, quality reports, quality governance, dashboard views, provider profiles, project context, memory/wiki commands, history/metrics, package-manager helpers, host safety hooks, or parallel lanes must state mode impact explicitly:

- applies to all three modes;
- applies to one or two modes only, with reason;
- intentionally not applicable, with reason.
