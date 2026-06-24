# Changelog

## Unreleased

- QA passed for Project Pipeline first-run `/pd` release readiness after Linux + native Windows UAT fixes: focused suites 52/52 green, full `corepack pnpm run check` green, Fallow clean, and Windows release-prep evidence accepted.

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
