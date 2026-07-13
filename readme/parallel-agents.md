# Optional Parallel Agents

PIDEX supports optional, non-blocking secondary lanes for selected review agents. When globally enabled and configured for an agent, eligible lanes run automatically at the matching pipeline trigger unless the user explicitly requests a minimal/single-lane run.

Supported agent containers:

- `pidex-critic`
- `pidex-code-reviewer`

## Config

Config resolution order is:

1. `PIDEX_PARALLEL_AGENTS_CONFIG` when set (read-only through PIDEX dashboard save operations)
2. `<pidex-root>/config/parallel-agents.local.json` when present
3. `<pidex-root>/config/parallel-agents.json` as the disabled public default

Dashboard saves target the local operator file unless an environment override is active. It is disabled by default. Each agent can have up to two provider/model selections. Provider/model choices are discovered from Pi where possible. The dashboard shows all discovered models, but only models whose provider appears authenticated are selectable.

Runtime warnings live at:

```text
<pidex-root>/state/parallel-agents/status.json
```

Warnings are state, not config.

## Dashboard

Settings contains a Parallel Agents area:

- one global status container
- one editable container for `pidex-critic`
- one editable container for `pidex-code-reviewer`

You can enable/disable the subsystem, choose up to two authenticated provider/model pairs per agent, save config, and clear warnings.

## CLI

```bash
node <pidex-root>/scripts/modules/run-check.mjs --capability parallel-agents.status --agent orchestrator --phase planning --project <project-root> -- show
node <pidex-root>/scripts/modules/run-check.mjs --capability parallel-agents.status --agent orchestrator --phase planning --project <project-root> -- eligible --agent pidex-critic --trigger after-plan --json
node <pidex-root>/scripts/modules/run-check.mjs --capability parallel-agents.status --agent orchestrator --phase planning --project <project-root> -- eligible --agent pidex-code-reviewer --trigger after-implementation --json
node <pidex-root>/scripts/modules/run-check.mjs --capability parallel-agents.status --agent orchestrator --phase planning --project <project-root> -- models --json
node <pidex-root>/scripts/modules/run-check.mjs --capability parallel-agents.status --agent orchestrator --phase planning --project <project-root> -- warn --lane 'pidex-code-reviewer:deepseek:deepseek-v4-flash' --message 'quota limit reached'
node <pidex-root>/scripts/modules/run-check.mjs --capability parallel-agents.status --agent orchestrator --phase planning --project <project-root> -- success --lane 'pidex-code-reviewer:deepseek:deepseek-v4-flash'
node <pidex-root>/scripts/modules/run-check.mjs --capability parallel-agents.status --agent orchestrator --phase planning --project <project-root> -- clear --lane 'pidex-code-reviewer:deepseek:deepseek-v4-flash'
```

Pi command after `/reload`:

```text
/pdparallel status
/pdparallel clear <lane-id>
/pdparallel test <lane-id> [project-root]
```

## Telegram

Warnings for usage limits, no balance, auth failure, or provider unavailability can send deduped Telegram messages via the existing PIDEX Telegram helper.

Disable with:

```bash
PIDEX_TELEGRAM_PARALLEL_WARNINGS=0
```

## Automatic orchestration contract

The PIDEX orchestrator checks configured lanes before supported review gates:

- `after-plan` launches enabled `pidex-critic` secondary lanes for plan review.
- `after-implementation` launches enabled `pidex-code-reviewer` secondary lanes for implementation review.

Each secondary receives explicit lane id, provider, model, effort, trigger, project mode, and assigned artifact path. For Pi-auth providers such as DeepSeek or Minimax, `eligible` emits `runner_provider=pi` and `runner_model=<provider>/<model>` because `pidex_agent` direct provider overrides only support `pi` and `codex`.

Secondary lanes are advisory until the orchestrator writes a merge/adjudication summary. They must write only their assigned `agents.output/**` artifact, must not edit source/config/rules/wiki/memory, and must route back to `orchestrator`.

## Mode contract

Parallel lanes are a target capability for every saved PIDEX project mode, but each mode preserves its own boundary:

| Mode | Lane execution contract |
|---|---|
| `host-direct` | Host orchestrator launches visible `pidex_agent` secondary lanes. Disabled/no eligible lanes must add no meaningful overhead. |
| `hardened-pipeline` | Host source remains canonical. MVP should run secondary review lanes host-side against host artifacts/sandbox evidence; secondary lanes do not apply source changes. |
| `project-pipeline` | Host orchestrator owns discovery/status/merge, but secondary review lanes run as Project Pipeline child Pi executions inside the Project Sandbox. Source remains container-canonical and archive sync remains `agents.output/**` + `wiki/**`. MVP may execute secondary lanes sequentially; true wall-clock concurrency is an optimization. |

Each trigger with successful lanes runs one primary configured adjudicator that reads the primary and secondary artifacts and writes a run-specific merge artifact under `agents.output/parallel-agents/**`. For Project Pipeline the review and adjudication execute inside `/workspace`, use exact assigned paths, and are archive-synced. A route back to correction stops before the next phase starts.

Telemetry for secondary lanes should include `project_mode`, `parallel_lane_id`, `parallel_trigger`, `parallel_role`, and Project Pipeline identifiers when applicable.

Project Pipeline secondary lanes are sequential. They use a bounded pre/post workspace manifest and may change only their assigned artifact. Routing omitted from the final response can be recovered from the exact non-empty assigned artifact without retrying the model. `run-lane.mjs` remains a manual status/test scaffold.

## Guarantees

- Ordinary provider/unavailability failure remains advisory; a write-fence or adjudication failure blocks Project Pipeline continuation.
- No usage/cost accounting is added for secondary lanes.
- Provider credentials/secrets must not be stored in config or state.
- Specialist agents do not spawn nested parallel lanes automatically.
