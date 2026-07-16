# Changelog

## Unreleased

- Made `agents.output/**`, `state/**`, and `pidex/state/**` unconditionally local runtime state: wiki hygiene no longer offers audit state for commit, and Pi blocks `git add -f`/`--force` across parent and child sessions even where Windows has no global Git hook.

## 0.2.2 - 2026-07-15

Explicit test-project classification:

- Added explicit `is_test_project` metadata for Project Pipeline registries and host pipeline events, replacing broad dashboard `/tmp`/`smoke` name heuristics with an additive project read-model flag and an explicit desktop/mobile `Show test projects` toggle; normal test activity inside a user project does not reclassify it.
- Added the Docker-independent `lifecycle.mjs set-test-project` producer command for safely reclassifying existing Project Pipeline entries.

## 0.2.1 - 2026-07-15

Roadmap governance follow-up:

- Added mandatory conversation-to-roadmap promotion before task classification: multi-increment analyses, parity matrices, audits, and design discussions must be reconciled with the canonical roadmap and delegated to `pidex-roadmap` for user-reviewed candidate entries before architect/planner routing; the orchestrator is explicitly forbidden from writing roadmap drafts itself.

## 0.2.0 - 2026-07-15

Project Pipeline host mirroring, Windows host-direct reliability, proportional orchestration, GPT-5.6 routing, and dashboard identity cleanup:

- Added mandatory archive-first mirroring of filtered Project Pipeline `agents.output/**` and `wiki/**` into every normal `/pd` project's registered host directory, with strict ownership manifests, conflict-safe updates/deletes, root-scoped locking, publication-report binding, bounded no-follow reads, degraded status reporting, and Linux/Windows regression evidence.
- Hardened Project Pipeline primary/secondary review execution with exact container artifact paths, no host fallback, provider/model/effort forwarding, authoritative final ROUTING recovery, sequential write fences, run-specific artifacts, and in-container adjudication.
- Added a proportional minimal-run circuit breaker: explicit minimal/MVP/single-lane intent skips optional generic secondary reviews, threat/evidence contract expansion requires user approval, and a second rejection or residual re-slice at the same gate stops automatic churn.
- Fixed native Windows `/pd` and `/pidex` delegate-auth preflight by invoking Bash with cwd-relative, separately passed script/config arguments; launch/setup failures are now distinct from credential failures, a missing Node.js runtime can no longer produce a misleading success, and no provider fallback is silent.
- Restored bare `/pd` task interviews for saved Project Pipeline projects instead of warning that an initial task argument is required; the in-container run still starts only after the task is confirmed.
- Avoided repeated Project Pipeline Pi-credential consent prompts by checking the selected project's credential status first; configured projects reuse their persistent credentials, while other states still require an explicit choice.
- Excluded system-temporary directories such as `/tmp/**` from `/pd` recent-project suggestions sourced from history or saved project modes.
- Added a Windows Git Credential Manager bridge for trusted Project Pipeline containers and documented the WSL Bash requirement for native Windows host-direct command execution.
- Corrected Codex quota-window classification from API duration metadata and preserved duration evidence through dashboard provider-limit APIs and views.
- Forwarded configured Pi reasoning effort through direct specialist execution.
- Simplified specialist startup/completion progress to show role, provider, model, and reasoning effort directly (for example, `Critic: openai-codex gpt-5.6-terra high`).
- Added `5.6-hybrid-balanced`, the new general default combining GPT-5.6 Sol for reasoning/review roles, Terra for implementation/operations roles, and Luna for retrospectives.
- Added the experimental `5.6-sol-quality` all-Sol profile and documented benchmark-based selection guidance, including GPT-5.5's current UI-speed advantage.
- Updated provider-limit probing to use Pi's `~/.pi/agent/auth.json` Codex OAuth token (`openai-codex.access`) before falling back to Codex CLI auth, plus a redacted `auth-status` check for diagnostics.
- Fixed dashboard provider-limit auto-refresh to call the module-owned provider-governance probe, restoring Codex/Codex Spark usage refresh for native Windows/no-Bash dashboard startup when Codex auth is available.
- Changed dashboard background canvas layers to static rendering and disabled hidden-tab query refetching to preserve the colorful background without continuous motion.
- Fixed dashboard Project Pipeline ingest to overwrite stale technical `pp-...` project display names with the source folder basename on subsequent ingest.
- Fixed dashboard ingestion treating `container-workspace` Docker volume refs as filesystem projects; stable control/previous host paths now preserve logical identity, and stale phantom rows plus dependent metrics, events, artifacts, and findings are transactionally merged into the canonical project.
- Stopped no-argument and dashboard auto-ingest from registering PIDEX itself and its internal `dashboard/` directory as user projects; both internal paths are excluded from the project selector even when historical rows contain dependent data. Legacy POSIX project rows accidentally stored with Windows backslashes are transactionally normalized and merged.
- Added bounded vertical scrolling to the desktop project selector so every project remains reachable when the list exceeds the available menu or viewport height.
- Fixed dashboard server PIDEX-root resolution for native Windows in-process startup so usage/profile/quality/modules/parallel-agent APIs read the actual `$HOME\pidex` checkout instead of resolving paths relative to the caller's current directory.
- Improved dashboard Project Pipeline display names so records whose registry name is the technical `pp-...` id fall back to the source folder basename, while preserving explicit friendly names.
- Fixed dashboard parallel-agent API routes to use the module-owned parallel-agent status capability instead of the retired legacy `scripts/parallel-agents/status.mjs` path.
- Fixed dashboard ingest so Project Pipeline archive directories are no longer registered as separate dashboard projects; archive artifacts are attributed to the registered Project Sandbox project and stale `* archive` project rows are cleaned up in the SQLite index only.
- Updated `node dashboard/start.mjs` on native Windows to run the dashboard in-process/foreground by default, avoiding visible cmd-window churn while preserving a one-command no-Bash dashboard startup; stop with `Ctrl+C`, or pass `--production` to force build+preview.
- Added `/pdproject diagnose <project-id>` as a no-Bash Project Pipeline diagnostic for native Windows/desktop sessions where the Pi `bash` tool cannot start `/bin/bash`; it reports registry, Docker, archive, dashboard DB visibility, and safe next actions through PIDEX Node helpers.
- Hardened Project Pipeline browser-smoke phase prompts/rules so QA/UAT request JSON must use the canonical Project Pipeline registry `project_id` from the phase prompt, preventing app-name/source-name mismatches such as `demo-app` versus `pp-demo-app-...`.
- Added read-only `pidex_project` tool so orchestrators can inspect Project Pipeline status, diagnostics, runs, artifacts, credential status, and preview status/logs through existing no-Bash PIDEX helpers instead of asking users to manually run `/pdproject` commands or spawning agents just to inspect Docker state.

## 0.1.15 - 2026-07-07

Project mode parity, Project Pipeline progress UX, and dashboard desktop fixes:

- Added Initiative 030 F1 project mode capability matrix documenting `host-direct`, `hardened-pipeline`, and `project-pipeline` support boundaries, supporting feature behavior, intentional differences, and required mode-impact rule for future features.
- Added mode telemetry for standard metrics/events and Project Pipeline phases, preserving optional `project_mode` through dashboard ingest, PDQ mode/source coverage summaries, and dashboard Overview/Runs/Quality mode visibility.
- Documented the all-mode optional parallel-lane contract for `host-direct`, `hardened-pipeline`, and `project-pipeline` before implementation slices.
- Added minimal Project Pipeline secondary parallel-lane support using existing child Pi execution, sequential MVP lane runs, archive-synced merge summaries, and hardened-pipeline review-only wording.
- Improved `/pd` Project Pipeline migration UX by replacing the blocking run-flow bridge with async child execution, visible Docker/phase progress notifications, and fail-closed interrupt handling.
- Added cross-platform `node dashboard/start.mjs` launcher for native Windows/no-Bash environments and made dashboard ingest register Project Pipeline sandbox registry records so migrated projects appear in the project selector.

## 0.1.14 - 2026-07-07

Project Pipeline documentation refresh:

- Refreshed README, Project Pipeline, and Windows docs to reflect the latest validated Project Sandbox state: local Docker Project Pipeline is working for the MVP on Linux and native Windows Docker Desktop, including managed preview and host-side browser-smoke evidence. Broader native Windows PIDEX support remains experimental pending more real-project evidence across delegates, auth, path quoting, hooks, dashboard, and provider workflows.

## 0.1.13 - 2026-07-06

Project Pipeline browser-smoke request schema hardening:

- Tightened Project Pipeline browser-smoke QA/UAT module rules with the canonical request JSON schema after Windows `/pd` E2E showed QA could emit an ad-hoc invalid request shape; rendered rules now explicitly require `schema: 1`, `project_id`, `contains`, `exists`, and `errors: "none"`, and forbid `request_type`, `project`, `expected`, `expected_text`, `selector`, and `level`.
- QA passed for Project Pipeline browser-smoke request schema rules fix: focused rendered-rule checks 4/4 green, render spot checks green, `modules:test`, full `check`, public readiness, and Fallow static audit completed.
- UAT passed for Project Pipeline browser-smoke request schema rules fix: doc chain proves QA/UAT rendered rules now include canonical schema examples, URL key guidance, and forbidden invalid Windows keys; release approved without pre-release Windows G9 rerun.
- Windows full `/pd` rerun from home passed after the schema-rule fix: `pidex-win-pd-smoke-2` produced a valid QA browser-smoke request, Project Pipeline registry preview URL `http://localhost:42120`, `BROWSER-SMOKE-PASS`, title/text/selector/url/console checks all green, and screenshot evidence archived.

## 0.1.12 - 2026-07-06

Project Pipeline browser-smoke host cache patch:

- Fixed Project Pipeline browser-smoke host bridge to use the PIDEX-local Playwright browser cache automatically. Remote tmux validation on the test server proved the host bridge can run Playwright against a live Project Sandbox managed preview without manually setting `PLAYWRIGHT_BROWSERS_PATH`.
- QA passed for Project Pipeline browser-smoke host cache fix: focused check/bridge regressions 18/18 green, full `corepack pnpm run check` green, public readiness green, Fallow recorded, and remote tmux no-env E2E evidence accepted.
- UAT passed for Project Pipeline browser-smoke host cache fix: implementation, code review, security, and QA evidence demonstrate no-env host-side Playwright bridge works against live managed preview with PIDEX-local cache and sandbox cleanup complete.

## 0.1.11 - 2026-07-06

Browser-smoke automation and module-scoped `agent_rules` integration:

- Added Initiative 022 module-scoped `agent_rules` Stage C Project Pipeline prompt integration: Project Pipeline orchestrator now renders matched module-owned rules into in-container phase prompts for `mode: project-pipeline`, while non-matching agents/phases and host-direct/no-mode contexts remain unaffected. Code review R2, security, QA, UAT, full `corepack pnpm run check`, and public readiness passed.
- Added Initiative 022 module-scoped `agent_rules` Stage B renderer: `scripts/modules/render-rules.mjs` can explicitly render matched rule bodies with provenance and precedence wrappers, unsafe-content blocking, invalid-context fail-closed behavior, and strict aggregate size caps while still avoiding automatic prompt injection. Code review R3, security R2, QA, UAT, full `corepack pnpm run check`, and public readiness passed.
- Added Initiative 021 Project Pipeline browser-smoke module-scoped `agent_rules`: QA/UAT/devops browser-smoke request/verdict/reachability rules now live under the Project Pipeline module and are discoverable as metadata only with `context.mjs --mode project-pipeline`; host-direct/no-mode contexts remain unaffected and no global rules were edited. Code review, security, QA, UAT, full `corepack pnpm run check`, and public readiness passed.
- Added Initiative 022 module-scoped `agent_rules` Stage A: module manifests can now declare validated, module-id-prefixed, metadata-only agent rule files with strict path, size, symlink, metadata, authority, agent/phase, mode, and capability-availability controls; `context.mjs --mode` shows matched rule provenance without rendering rule bodies or injecting prompts. Code review, security R2, QA, UAT, full `corepack pnpm run check`, and public readiness passed.
- UAT passed for Initiative 021 Project Pipeline browser-smoke orchestration Slice 4: `/pd` can auto-discover browser-smoke request artifacts after validation phases, run deterministic host bridge checks, and return archive-relative evidence to same-agent final verdict tasks without manual bridge commands or host-direct fallback.
- UAT passed for Initiative 021 Project Pipeline browser-smoke contract Slice 3 host bridge/capability: controlled request-artifact bridge, registry-managed preview URL provenance, no-overwrite archive evidence, and trusted runtime root approved for release; `/pd` automation remains Slice 4.
- QA passed for Initiative 021 Project Pipeline browser-smoke contract Slice 3 host bridge/capability: 32 focused tests green, CLI typed-skip smoke green, full `corepack pnpm run check` green, public readiness green, and Fallow recorded.
- Added Initiative 021 browser-smoke contract Slice 4 Project Pipeline orchestration integration: after QA/UAT/devops phases, `/pd` Project Pipeline now auto-discovers browser-smoke request artifacts, invokes the safe host bridge, records archive-relative evidence refs, and gives the same validation agent a one-shot final verdict task without requiring a manual browser-smoke command. Code review, security, QA R2, UAT, full `corepack pnpm run check`, and public readiness passed.
- Added Initiative 021 browser-smoke contract Slice 3 Project Pipeline bridge execution/capability: QA/UAT/devops request artifacts are validated against the registered project archive, the host resolves the managed preview URL from the Project Pipeline registry, results are written under no-overwrite `browser-smoke/<request-id>/` archive dirs, and browser runtime resolution is bound to trusted PIDEX `state/browser-smoke`. Code review, security, QA, UAT, full `corepack pnpm run check`, and public readiness passed.
- Added Initiative 021 browser-smoke contract Slice 2 generic `browser-smoke.check` substrate: loopback-only deterministic browser checks, no browser install side effects, typed `BROWSER-SMOKE-SKIP-NOT-CONFIGURED` when Playwright is unavailable, realpath-confined result artifacts, console redaction/caps, and neutral caller-provided URL provenance. Code review, security, QA, UAT, full `corepack pnpm run check`, and public readiness passed.
- QA passed for Initiative 021 Project Pipeline browser-smoke contract Slice 1 R3: sandbox-tool-call env isolation fixed, focused browser-smoke/bridge tests green, full `corepack pnpm run check` green, and public readiness green.

## 0.1.10 - 2026-06-29

Project Pipeline managed preview and Windows Docker Desktop UX hardening:

- Project Pipeline UI runs now auto-start a managed preview gate and present the browser URL for user approval/rejection instead of asking operators to manually run `/pdproject preview start` when automatic preview startup is possible.
- Per-project mode routing was hardened so `/pd` only probes the hardened sandbox when the selected project mode is `hardened-pipeline`; Project Pipeline mode remains explicit and fail-closed with no host-direct fallback.
- Project Pipeline preview lifecycle now adopts already-published per-project preview port ranges, expands `$PORT`/`${PORT}`/`%PORT%` placeholders without requiring a shell, and uses `pnpm exec vite --host 0.0.0.0 --port $PORT` as the default Vite preview command.
- Docker CLI calls from Project Pipeline helpers now set Git Bash/MSYS-safe path-conversion guards so Windows Docker Desktop runs no longer require operators to remember `MSYS_NO_PATHCONV=1` manually.
- Module capability passthrough policy now accepts realistic multiline `--task` text and safe absolute PIDEX/project/auth paths for Project Pipeline orchestrator calls without broadly opening arbitrary passthrough arguments.
- Project Pipeline credential bootstrap sanitizes copied Pi `settings.json` for container use by stripping host-local package extension paths that are invalid inside Docker.
- `/pd` project selection UX was restored to the orchestrator/chat-style interview for non-project starts, with recent projects supplied as context instead of a cramped extension select menu; saved Project Pipeline projects are included in recent-project context.
- Native Windows Docker Desktop UAT passed multiple Project Pipeline preview scenarios, including simple Vite React fixtures and a richer dashboard fixture with automatic managed preview, HTTP 200 verification, QA approval, and user preview acceptance.
- Release-readiness QA passed: focused Project Pipeline suites, full `corepack pnpm run check`, public-readiness packlist validation, and Windows end-to-end preview UAT evidence all green.

## 0.1.9 - 2026-06-24

Project Pipeline first-run `/pd` release-readiness update:

- Standard `/pd` can now enter Project Pipeline mode without requiring a prior `/pdproject use project-pipeline` setup step.
- Fresh `/pd` starts from non-project directories correctly: if no existing project is selected, the orchestrator asks for project/name/path/new before any mode selection.
- Recent-project selection now includes `New project / different path`, so operators with PIDEX history can still start a new project from home/non-project directories.
- Existing-project mode routing remains per-project: project selection happens before mode resolution, and `project-pipeline` remains explicit and fail-closed with no host-direct/hardened fallback.
- Project Pipeline selector wording now explains `host-direct`, `hardened-pipeline`, and `project-pipeline` choices, including artifact/wiki-only sync semantics.
- Credential staging into trusted persistent Project Sandboxes was hardened: Pi/provider credentials stream into the sandbox without brittle `docker cp`/`chown`, destination filenames are passed as shell arguments, and credential copy still requires explicit consent or an explicit env override.
- Project Pipeline child prompts now clarify that `/workspace` is the source root and that nested host-path/drive-letter/project-name directories are layout defects, not expected output locations.
- Linux remote real Pi TUI/tmux UAT passed for first-run Project Pipeline `/pd`, including credential cleanup and artifact-only archive sync.
- Native Windows real Pi TUI UAT passed from `C:\Users\Daniel>` through new-project onboarding, Project Pipeline mode selection, explicit credential consent, full agent chain, `/pdproject runs`, `/pdproject artifacts`, and remove/cleanup.
- Release-readiness QA passed: focused suites 52/52 green, full `corepack pnpm run check` green, Fallow clean, and Linux + Windows UAT evidence accepted.

## 0.1.8 - 2026-06-22

Initial public-prep npm release of PIDEX, a Codex-oriented Pi package with `pidex-*` agents, project context, quality reporting, quality governance, optional parallel review lanes, dashboard, project memory, wiki hygiene, and public-readiness guardrails. This supersedes source tag `v0.1.7` for npm publication because `@d-trattner/pidex@0.1.7` was already occupied on npm by an older package build.

Public-readiness changes include:

- Exact `~/pidex` install contract documented.
- Legacy `dashboard-old/**` archive removed.
- Runtime dashboard ingest moved to `scripts/dashboard/ingest.mjs`.
- Explicit npm package allowlist added.
- Direct `pidex_agent` provider overrides restricted to `pi` and `codex`.
- Pi SDK dependency namespace updated to `@earendil-works/*`.
- `analysis/**` and local `wiki/**` removed from public source.
- `npm run public:check` added for repeatable public-release validation.
- PDQ operator-contract transparency, trace normalization, valid operator-decision evidence, and disabled-by-default contract governor added.
- Dashboard Quality page expanded with selector-scoped PDQ state, background governance status, and Settings → Quality Governance controls.
- Linux install now installs dashboard dependencies when needed; Windows bootstrap already does this unless skipped.
- Install/public-readiness hardening: no-git-history installs skip historical parity fixtures, and public-readiness uses per-user temporary files.
- Dashboard model-quality success-rate bug fixed.
- Module capability reference hardening added: install/uninstall use fixed module capability IDs for git-hook actions, module reference guard blocks caller-zone implementation path leaks, and module docs clarify deterministic script policy.
- Public-readiness reclassified as fixed-core public release authority at `scripts/release/public-readiness.sh`; release-safety module now exposes only non-authority helper capability `release.reference-integrity`.
- Retired temporary module-tree release-safety compatibility shims after fixed-core reclassification validation.
- UAT Complete for Plan 6 (`module-capability-reference-hardening`): deterministic capability invocation and wrapper-preserving compatibility checks approved for release lane.
- UAT Complete for Plan 7 (`public-readiness-fixed-core-reclassification`): public-readiness authority moved to fixed-core release path; module release-safety retains helper-only role.
- UAT Complete for Plan 9 (`remove-root-legacy-wrappers`): conservative root wrapper cleanup passed (`analysis/run-pipeline-analysis.sh`, `metrics/{record,summarize}`, `parallel-agents/run-lane`, `project-metadata/migrate-to-pidex-folder` removed; active/deferred wrappers retained by plan).
- UAT Complete for Plan 10 (`seven-remaining-wrapper-migrations`): remaining agentic/project-bound root wrappers migrated to module capabilities and retired; fixed-core release scripts preserved; git hook install now migrates legacy root hook path to module-owned hook path safely.
- PIDEX repository migrated to a pinned pnpm workspace (`pnpm@10.33.0`) with `pnpm-workspace.yaml`, `pnpm-lock.yaml`, dashboard package name `@pidex/dashboard`, and no tracked `package-lock.json` files.
- Installers, dashboard launchers, doctor/smoke scripts, and public-readiness checks now prefer Corepack-provided pnpm when it resolves to `10.33.0`, while supporting standalone/global `pnpm@10.33.0` as a fallback.
- Package-manager hardening added: target-project package-manager detection, pnpm default for new JS/TS projects, npm compatibility for existing npm projects, and fail-closed handling for unsupported yarn/bun execution paths.
- Windows validation refreshed with standalone `pnpm@10.33.0`: install/check/typecheck/build/dashboard-start dry-run paths passed on Node.js 26.2.0.
- npm bootstrap readiness refreshed after pnpm migration: `/pidex-init-home` now uses `install.windows.ps1` on native Windows, package docs under `readme/` are included in the npm package, public-readiness validates npm's publish packlist, and docs clarify npm as a lightweight Pi-bootstrap path only. Windows docs now call out Pi CLI `>=0.78.0` for current pipeline testing.
- Optional Docker sandbox MVP added for selected source-changing PIDEX work: public default remains `off`; local `hardened-pipeline` mode uses canonical-checkout runtime helpers, copy-in/copy-out workspaces, Docker hardening flags, env/secret guards, source patch validation, assigned artifact extraction, cleanup/status helpers, and sandbox child tool-call hardening. Linux real `/pd` small-pipeline evidence and native Windows Docker helper smoke evidence were collected; full native Windows `/pd` pipeline evidence is still pending. Dashboard integration remains deferred.
- Local Project Pipeline MVP completed for Docker-backed Project Sandboxes: explicit `project-pipeline` mode routes `/pd` through the in-container orchestrator; persistent project containers support create/open/repair/remove, local import/clone, credential bootstrap, in-container Pi execution, artifact-only archive sync, run metadata, and safe `/pdproject` management commands (`status`, `runs`, `show-run`, `artifacts`, `open`, `repair`, `credentials status/reset`, `remove`). External Docker hosts, PR automation, and dashboard browsing remain deferred.
- Highest real Project Pipeline `/pd` scenario passed against `wiki/testing/highest-roadmap-and-feature-evolution.md`: two real Pi TUI `/pd` invocations in the same Docker Project Sandbox completed onboarding/roadmap and importance-level feature evolution, with all 12 phase runs passing and final in-container tests green.
- Project Pipeline UAT hardening added after real scenario feedback: local imports now write as the sandbox user, the orchestrator retries missing phase routing once, and unattended `/pd` scenarios can set `PIDEX_PROJECT_PIPELINE_COPY_PI_CREDENTIALS=1|0` for deterministic credential handling.
- QA passed for Project Pipeline `/pd` first-run post-UAT fixes: targeted credential/mode suites, full `corepack pnpm run check`, Fallow, and remote real Pi TUI blocker evidence all green.
