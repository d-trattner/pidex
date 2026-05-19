# Changelog

## 0.1.0 - Unreleased

Initial public-prep release of PIDEX, a Codex-oriented Pi package with `pidex-*` agents, project context, quality reporting, optional parallel review lanes, dashboard, project memory, wiki hygiene, and public-readiness guardrails.

Public-readiness changes include:

- Exact `~/pidex` install contract documented.
- Legacy `dashboard-old/**` archive removed.
- Runtime dashboard ingest moved to `scripts/dashboard/ingest.py`.
- Explicit npm package allowlist added.
- Direct `pidex_agent` provider overrides restricted to `pi` and `codex`.
- Pi SDK dependency namespace updated to `@earendil-works/*`.
- `analysis/**` and local `wiki/**` removed from public source.
- `npm run public:check` added for repeatable public-release validation.
