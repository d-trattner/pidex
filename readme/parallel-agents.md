# Optional Parallel Agents

PIDEX supports optional, non-blocking secondary lanes for selected review agents.

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
python3 <pidex-root>/scripts/parallel-agents/status.py models --json
python3 <pidex-root>/scripts/parallel-agents/status.py warn --lane 'pidex-code-reviewer:claude:sonnet' --message 'quota limit reached'
python3 <pidex-root>/scripts/parallel-agents/status.py clear --lane 'pidex-code-reviewer:claude:sonnet'
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

## Guarantees

- Secondary lane failure does not block the primary PIDEX pipeline.
- No usage/cost accounting is added for secondary lanes.
- Provider credentials/secrets must not be stored in config or state.
- Specialist agents do not spawn nested parallel lanes automatically.
