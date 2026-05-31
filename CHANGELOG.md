# Changelog

## 0.1.0 - Unreleased

Initial public-prep release of PIDEX, a Codex-oriented Pi package with `pidex-*` agents, project context, quality reporting, quality governance, optional parallel review lanes, dashboard, project memory, wiki hygiene, and public-readiness guardrails.

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
- UAT Complete for Plan 6 (`module-capability-reference-hardening`): deterministic capability invocation and wrapper-preserving compatibility checks approved for release lane.
