# Optional Parallel Agents

PIDEX supports optional, non-blocking secondary lanes for selected review agents. When globally enabled and configured for an agent, eligible lanes run automatically at the matching pipeline trigger unless the user explicitly requests a minimal/single-lane run.

Supported agent containers:

- `pidex-critic`
- `pidex-code-reviewer`

## Config

Config lives at:

```text
<pidex-root>/config/parallel-agents.json
```

It is disabled by default. Each agent can have up to two provider/model selections. Provider/model choices are discovered from Pi where possible. The dashboard shows all discovered models, but only models whose provider appears authenticated are selectable.

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
python3 <pidex-root>/scripts/parallel-agents/status.py show
python3 <pidex-root>/scripts/parallel-agents/status.py eligible --agent pidex-critic --trigger after-plan --json
python3 <pidex-root>/scripts/parallel-agents/status.py eligible --agent pidex-code-reviewer --trigger after-implementation --json
python3 <pidex-root>/scripts/parallel-agents/status.py models --json
python3 <pidex-root>/scripts/parallel-agents/status.py warn --lane 'pidex-code-reviewer:deepseek:deepseek-v4-flash' --message 'quota limit reached'
python3 <pidex-root>/scripts/parallel-agents/status.py success --lane 'pidex-code-reviewer:deepseek:deepseek-v4-flash'
python3 <pidex-root>/scripts/parallel-agents/status.py clear --lane 'pidex-code-reviewer:deepseek:deepseek-v4-flash'
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

## Automatic orchestration

The PIDEX orchestrator checks configured lanes before supported review gates:

- `after-plan` launches enabled `pidex-critic` secondary lanes alongside the primary critic.
- `after-implementation` launches enabled `pidex-code-reviewer` secondary lanes alongside the primary reviewer.

Each secondary is a visible `pidex_agent` call with explicit `provider`, `model`, and `effort` from `status.py eligible`. For Pi-auth providers such as DeepSeek or Minimax, `eligible` emits `runner_provider=pi` and `runner_model=<provider>/<model>` because `pidex_agent` direct provider overrides only support `pi` and `codex`. Secondary artifacts must use unique paths under `agents.output/**` and are advisory. The orchestrator records lane success/failure in `state/parallel-agents/status.json`, writes a merge/adjudication summary, and continues primary flow unless a secondary reports concrete High/Critical evidence that needs adjudication.

## Guarantees

- Secondary lane failure does not block the primary PIDEX pipeline.
- No usage/cost accounting is added for secondary lanes.
- Provider credentials/secrets must not be stored in config or state.
- Specialist agents do not spawn nested parallel lanes automatically.
