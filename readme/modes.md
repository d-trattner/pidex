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
| Source changes returned to host | Direct edits | Patch/apply from temporary sandbox after approval | Intentionally not automatic; source remains in Project Sandbox |
| Artifact location | Host project `agents.output/**`, `wiki/**` | Extracted to host project `agents.output/**`, `wiki/**` | Host archive under `state/project-archives/<project-id>/` |
| Artifact browsing | Direct files | Direct files plus sandbox evidence | `/pdproject runs`, `show-run`, `artifacts` |
| Credential model | Host Pi/provider credentials | Host orchestrator credentials; sandbox blocks sensitive host reads | Explicit copied credentials into trusted persistent container secrets volume |
| Delegate/provider routing | Full configured host delegates | Host delegates where applicable; sandboxed agents use wrapper constraints | In-container Pi uses copied config/credentials |
| Parallel secondary lanes | Supported by host orchestrator config with no required host-direct slowdown | Supported through host-side review-only secondary lanes; host source remains canonical and sandbox evidence is input only | Supported by Project Pipeline orchestrator; secondary lanes run sequentially in Project Sandbox for MVP and write archive-synced `agents.output/parallel-agents/**` artifacts |
| Module capability discovery | Available | Available | Available |
| Module-scoped rule metadata/rendering | Available | Available | Available |
| Live module-rule prompt injection | Not an architectural baseline; only use when an active module/rule needs it, without adding host-direct bottlenecks | Not needed until a hardened-specific module/rule requires it | Yes for current Project Pipeline browser-smoke phase rules with `mode: project-pipeline` filters |
| Managed preview lifecycle | Not mode-native today; host-direct should stay low-friction and avoid mandatory preview overhead | Wanted as a host-project preview helper while Docker remains only the programming harness | Yes: `/pdproject preview` and automatic UI preview gates |
| Browser-smoke install/preflight | Available as PIDEX-local host capability | Available as PIDEX-local host capability | Available and integrated with Project Pipeline bridge |
| Browser-smoke automatic request/bridge/verdict loop | Not currently automatic | Not currently automatic | Yes for QA/UAT/devops request artifacts |
| Browser URL source | User/project-owned | User/project-owned | Project Pipeline registry-managed preview URL |
| Sandbox boundary | None beyond policy/tool guards | Temporary Docker workspace, host source protected until apply | Persistent Docker Project Sandbox, archive-only host sync |
| Windows evidence | Experimental/general coverage incomplete | Helper smoke coverage; no special regression identified from Project Sandbox work | Focused native Windows Docker Desktop `/pd` + managed preview + browser-smoke pass |
| Primary management commands | `/pd`, `/pdq`, `/pdwiki`, `/pdmem`, `/pdparallel` | Same host commands plus sandbox evidence | `/pd`, `/pdproject`, archive helpers; host commands should remain simple unless they truly need mode-specific data |

## Supporting feature mode behavior

These features are not always part of the source-changing agent path, but they are user-visible PIDEX surfaces. The table documents where they read, write, or report today so future changes can avoid accidental mode drift.

| Supporting feature | `host-direct` | `hardened-pipeline` | `project-pipeline` |
|---|---|---|---|
| Project context / grilling | Reads and writes host project `pidex/context/**`; pre-flight may use project docs before planner handoff | Same host project context; sandboxed agent work treats host context as orchestrator-provided input | Project-specific PIDEX context files still live in the host project directory; Project Sandbox source remains container-canonical |
| Quality reports / PDQ | Reads host PIDEX state, project artifacts, metrics, and rules; writes reports under host PIDEX/report locations; reports observed `project_mode` coverage | Reads host state plus sandbox evidence where available; reports observed `project_mode` coverage | Reads host PIDEX state plus Project Pipeline registry/archive metrics; reports saved/observed `project_mode` and warns when saved Project Pipeline projects lack Project Pipeline telemetry |
| Quality governance / rule learning | Host PIDEX quality state and rule evidence | Host PIDEX quality state plus sandbox run evidence | Host PIDEX quality state plus Project Pipeline mode/archive telemetry where emitted |
| Wiki hygiene | Audits host project `wiki/**` and project-local PIDEX rules | Same host project wiki/rules | Project-specific wiki files live in the host project directory regardless of mode; analyze only if reports need mode/archive context |
| Project session memory | Writes host project `wiki/session-memory/**` | Writes host project memory outside temporary sandbox | Writes host project `wiki/session-memory/**` regardless of mode unless a future feature deliberately changes that contract |
| Dashboard views | Host PIDEX dashboard reads host runtime state, metrics, wiki/context summaries, provider data, and mode summaries | Same host dashboard plus any sandbox events/mode labels that are recorded | Host dashboard surfaces Project Pipeline mode telemetry through summary, runs, pipelines, and quality mode sections |
| Provider limits / profiles | Host PIDEX provider governance and profile state | Same host provider governance; sandboxed phases may inherit constrained routing | Host PIDEX profile state plus copied in-container Pi/provider config for Project Sandbox execution |
| History / metrics / recent projects | Host PIDEX metrics/history state records runs, recent projects, and optional `project_mode` | Host PIDEX metrics/history plus sandbox warnings/evidence and optional `project_mode` when emitted | Host PIDEX history plus Project Pipeline registry/archive records; Project Pipeline orchestration emits `project_mode`, archive source, and parallel-lane telemetry |
| Host safety / project boundary / Git hooks | Host policy guards and optional global Git hook protect host checkout work | Host guards plus temporary Docker boundary before apply/extract | Host orchestrator guards plus Docker Project Sandbox and archive-only host sync; optional Git hook applies to host repos, not container commits by itself |
| Package-manager helpers | Detect/build commands against host project package root | Host or sandbox package root depending phase wrapper | In-container `/workspace` package root for Project Sandbox work; host helpers remain PIDEX-runtime utilities unless bridged deliberately |
| Browser-smoke runtime maintenance | PIDEX-local host Playwright/cache cleanup and preflight | Same host PIDEX runtime maintenance | Same host PIDEX runtime maintenance plus Project Pipeline bridge/archive cleanup considerations |
| Install / doctor / release readiness | Host PIDEX runtime maintenance, not per-project execution | Same | Same host PIDEX runtime maintenance; Project Sandbox images/volumes are managed separately |

## Intentional differences

- Host-direct should remain the least-boundary, lowest-overhead mode. Do not add mandatory preview, module-rule injection, or orchestration bottlenecks to host-direct unless a concrete feature requires them.
- Project Pipeline managed preview is mode-native because the app runs inside Docker and needs registry-owned port/URL handling.
- Hardened-pipeline should use Docker as a programming harness only; host source remains main, and source changes copy back only after approval.
- Hardened-pipeline managed preview is wanted as a host-project helper, not as proof that the Docker harness owns runtime preview state.
- Project Pipeline browser-smoke automation is mode-native today because request validation is bound to a registered Project Pipeline archive and managed preview registry URL.
- Hardened-pipeline is temporary protection for selected host-project work. It should not become a persistent source-of-truth container.
- Project Pipeline source is intentionally not mirrored back to the host automatically. The container is the desired source-of-truth for that mode.
- Project-specific PIDEX context, wiki, and memory files live in the host project directory regardless of execution mode unless a future feature deliberately changes that contract.
- Not all module-scoped rules should apply to all modes. Rules must declare mode scope when behavior is mode-specific; live prompt injection is a module need, not a baseline requirement.

## Known open parity decisions

Tracked in Initiative 030 Project Mode Feature Parity:

1. Whether host-direct/hardened should get browser-smoke automation or only generic/manual browser-smoke capability.
2. Whether optional parallel secondary lanes need true concurrency and richer dashboard/PDQ lane visualization beyond the current all-mode contract and Project Pipeline sequential MVP.
3. Whether `/pdwiki`, `/pdmem`, and `/pdparallel` need further mode-aware behavior, or whether their host-project contracts are already sufficient.
4. Whether quality governance/rule learning needs deeper Project Pipeline archive evidence beyond the emitted mode/archive telemetry.
5. Whether hardened-pipeline managed preview should be added as a host-project helper.
6. Whether a unified mode-aware artifact/status command should exist.

## Rule for future feature changes

Any feature touching `/pd`, `pidex_agent`, artifacts, preview, browser-smoke, credentials, modules, quality reports, quality governance, dashboard views, provider profiles, project context, memory/wiki commands, history/metrics, package-manager helpers, host safety hooks, or parallel lanes must state mode impact explicitly:

- applies to all three modes;
- applies to one or two modes only, with reason;
- intentionally not applicable, with reason.
