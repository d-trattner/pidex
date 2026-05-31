# PIDEX Modules

PIDEX modules are an internal architecture boundary for PIDEX-owned workflow features. They make feature ownership, enablement, validation, and agent-facing capabilities explicit without changing the canonical PIDEX runtime root.

## Current status

The module framework is internal-first and supports manifests, install-level config, validation, discovery, runner execution, evidence, and read-only dashboard transparency.

Physically migrated first-party modules now include:

- `pidex.release-safety`;
- `pidex.parallel-agents`;
- `pidex.git-security-hooks`;
- `pidex.provider-governance`;
- `pidex.project-context`;
- `pidex.memory-wiki-hygiene`;
- `pidex.compat-windows`;
- `pidex.analysis-metrics-history`.

The migration is intentionally rationalized: not every PIDEX surface should become a physical module. Dashboard host/core, process-rule authority, quality governance core, package-facing Pi extension/prompts/skills/agents, and root install/bootstrap files remain fixed infrastructure or public-contract exceptions unless a later approved design changes that.

Not implemented yet:

- third-party modules;
- module registry/install;
- dashboard feature contribution loader;
- dashboard module management UI;
- removal of compatibility wrappers;
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
pidex.core                       core-required
pidex.process-rules              core-required
pidex.quality-core               core-required
pidex.release-safety             core-toggleable
pidex.parallel-agents            optional-internal
pidex.git-security-hooks         optional-internal
pidex.provider-governance        optional-internal
pidex.project-context            optional-internal
pidex.memory-wiki-hygiene        optional-internal
pidex.compat-windows             optional-internal
pidex.analysis-metrics-history   optional-internal
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

Module validation is part of the standard `npm run check` chain. `scripts/release/public-readiness.sh --skip-check` still runs the cheap module validation directly, so release preflights cannot bypass invalid module manifests/config. Full module TDD coverage remains separate under `npm run modules:test`.

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

## DevOps pre-release handoff integration

For pre-release, public-readiness, npm publication, and PIDEX self-release work, `pidex-devops` should generate module capability context before choosing release checks:

```bash
node scripts/modules/context.mjs \
  --agent pidex-devops \
  --phase pre-release \
  --project "$PWD"
```

The generated section may be pasted into a deployment/readiness artifact, but it remains advisory-only. It should help the agent see required checks and unavailable capability reasons. It must not cause automatic execution.

Execution rule:

- only execute checks explicitly requested by the handoff/operator;
- execute module checks only through `scripts/modules/run-check.mjs`;
- do not execute raw manifest commands from discovery/debug output;
- keep `scripts/release/public-readiness.sh` as release authority until a later approved module stage changes that.

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

## Rationalized modularity guardrails

- Keep compatibility wrappers at stable legacy `scripts/**` paths until wrapper lifecycle gates allow retirement.
- Keep `scripts/release/public-readiness.sh` as the permanent public release authority wrapper unless the operator explicitly approves changing that contract.
- Do not expose raw script paths to agents as the normal execution path.
- Do not modularize dashboard host/core as a normal module.
- Do not move dashboard feature slices until a dashboard contribution/feature-loader design exists.
- Do not add third-party loading yet.
- Do not let optional modules silently add process rules.
- Treat 100% first-party modularity as an ownership/classification scorecard: physical module-owned, fixed core, public-contract exception, or explicit deferred backlog.

## Wrapper lifecycle

See `readme/module-wrapper-lifecycle.md` for wrapper classes, parity matrix requirements, soak periods, and retirement gates.

## Related docs

- Initiative draft: `wiki/initiatives/022-pidex-module-framework/`
- Release-safety module: see the README under `modules` / `pidex` / `release-safety`.
