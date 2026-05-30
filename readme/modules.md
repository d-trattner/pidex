# PIDEX Modules

PIDEX modules are an internal architecture boundary for PIDEX-owned workflow features. They make feature ownership, enablement, validation, and agent-facing capabilities explicit without changing the canonical PIDEX runtime root.

## Current status

The module framework is in MVP Stage 1.

Implemented now:

- module manifests under `modules/pidex/**/module.json`;
- install-level module config at `config/modules.json`;
- deterministic list/validate/discover/run-check scripts;
- first core-toggleable module: `pidex.release-safety`;
- first capabilities:
  - `release.reference-integrity`;
  - `release.public-readiness`.

Not implemented yet:

- third-party modules;
- module registry/install;
- dashboard module management UI;
- physical migration of release scripts into module folders;
- automatic agent handoff injection;
- external rule contributions.

## Runtime root

Modules assume the canonical PIDEX runtime checkout:

```text
~/pidex
```

The npm Pi package is only a lightweight bootstrap package. If PIDEX was installed through:

```bash
pi install npm:@d-trattner/pidex
```

run this in Pi first:

```text
/pidex-init-home
/reload
```

After that, Pi uses the canonical `~/pidex` checkout and module scripts resolve from there.

## Module kinds

Current kinds:

```text
core-required      always enabled and locked
core-toggleable    first-party PIDEX module, enabled/disabled through config unless protected by core
optional-internal  future first-party optional module
```

Current modules:

```text
pidex.core              core-required
pidex.process-rules     core-required
pidex.quality-core      core-required
pidex.release-safety    core-toggleable
```

Core-required modules do not appear in `config/modules.json` as configurable entries.

## Config

Install-level config:

```text
config/modules.json
config/modules.local.json    # optional local override, ignored by Git
```

Current public default:

```json
{
  "modules": {
    "pidex.release-safety": {
      "enabled": true
    }
  }
}
```

`pidex.release-safety` is generally toggleable, but PIDEX core protects it for PIDEX self-release/publication context.

## Commands

List modules:

```bash
node scripts/modules/list.mjs --json
npm run modules:list
```

Validate modules:

```bash
node scripts/modules/validate.mjs --project "$PWD"
npm run modules:validate
```

Discover capabilities for an agent and phase:

```bash
node scripts/modules/discover.mjs \
  --agent pidex-devops \
  --phase pre-release \
  --project "$PWD"
```

Format current-phase capabilities as compact advisory markdown for agent handoffs:

```bash
node scripts/modules/context.mjs \
  --agent pidex-devops \
  --phase pre-release \
  --project "$PWD"

npm run modules:context
```

Run a capability through the module runner:

```bash
node scripts/modules/run-check.mjs \
  --capability release.reference-integrity \
  --agent pidex-devops \
  --phase pre-release \
  --project "$PWD"
```

Run module tests:

```bash
npm run modules:test
```

## Discovery contract

Discovery is agent-aware and phase-aware.

Normal agents receive current-phase capabilities only. Unavailable current-phase capabilities are still shown with reasons, for example:

```text
module_disabled
protected_module_disabled
agent_not_allowed
platform_not_declared
platform_command_unavailable
```

The pseudo-agent `orchestrator` receives a phase-grouped capability map with the current phase highlighted.

Discovery returns runner invocations by default, not raw implementation commands. Raw commands are visible only with `--debug`.

`context.mjs` turns discovery into handoff markdown. Its output is advisory-only metadata; it does not grant permission to execute checks. Agents should execute only checks explicitly requested by the handoff and should use `scripts/modules/run-check.mjs` runner invocations.

## Evidence

`run-check` writes structured JSONL evidence.

Install-scoped evidence path:

```text
state/modules/evidence/YYYY-MM-DD.jsonl
```

Evidence rows use:

```json
{
  "type": "module_capability_evidence",
  "module_id": "pidex.release-safety",
  "capability_id": "release.reference-integrity",
  "agent": "pidex-devops",
  "phase": "pre-release",
  "status": "passed"
}
```

## Stage 1 guardrails

- Do not move existing release files yet.
- Do not expose raw script paths to agents as the normal execution path.
- Do not add dashboard UI yet.
- Do not add third-party loading yet.
- Keep `scripts/release/public-readiness.sh` as the release authority until the module runner is proven over more runs.

## Related docs

- Initiative draft: `wiki/initiatives/022-pidex-module-framework/`
- Release-safety module: see the README under `modules` / `pidex` / `release-safety`.
