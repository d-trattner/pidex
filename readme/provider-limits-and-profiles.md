# Provider Limits and Profiles

PIDEX tracks provider-native Codex quota windows and uses profiles to switch complete agent-routing configurations. Profiles cover Spark/no-Spark fallback as well as GPT-5.6 role-specialized routing.

## Tracked quota families

PIDEX tracks:

- `codex`
- `codex-spark`

Supported quota windows include:

- `five_hour`
- `seven_day`

Usage is represented as `used_percent`.

## Refresh behavior

The dashboard/API refreshes stale provider-limit state automatically.

Current state is stored under:

```text
<pidex-root>/state/provider-limits/latest.json
```

The probe/alert helpers live under:

```text
`provider-governance.*` module capabilities (run via `<pidex-root>/scripts/modules/run-check.mjs`)
```

## Spark alert suppression

Spark alerts are suppressed when the active profile is a no-Spark profile.

Override this behavior with:

```bash
PIDEX_PROVIDER_ALERT_SPARK_WHEN_INACTIVE=1
```

## Spark limit protection

If Spark usage reaches 99%, or the provider reports Spark as blocked, PIDEX auto-switches to the equivalent no-Spark profile when available.

Example mappings:

- `5.4-plus-spark-balanced` → `5.4-no-spark-balanced`
- `5.4-plus-spark-xhigh` → `5.4-no-spark-xhigh`
- `5.5-plus-spark-balanced` → `5.5-no-spark-balanced`

## Profile files

Profiles live under:

```text
<pidex-root>/config/profiles/*.json
```

The active routing config is controlled by PIDEX provider/profile logic and surfaced in the dashboard Usage and Settings sections.

List or activate a profile from the canonical checkout:

```bash
cd ~/pidex
node modules/pidex/provider-governance/scripts/provider-limits/probe.mjs use 5.6-hybrid-balanced
```

Activating a profile replaces `config/agents.json` with that complete preset. Commit profile files, but treat `config/agents.json` as the currently selected routing configuration.

## GPT-5.6 profiles

### `5.6-hybrid-balanced`

The recommended general-purpose default uses each GPT-5.6 variant for the roles where it is intended to be strongest:

- **Sol:** analyst, architect, planner, roadmap, code review, and security
- **Terra:** critic, designer, implementer, devops, QA, UAT, and Pi support
- **Luna:** retrospective

Reasoning-intensive roles use high or xhigh effort where configured. Operational roles generally retain medium effort to balance quality, latency, and cost.

### `5.6-sol-quality`

Routes every PIDEX role to `openai-codex/gpt-5.6-sol`. This preset is useful for controlled quality-focused comparisons and unusually difficult reasoning work. It is not the recommended broad default: follow-up evaluation passed UI and structural-refactor scenarios but failed the API-security scenario because the implementation used the wrong token environment variable.

## Benchmark guidance

Controlled real `/pd` fixture runs produced these practical recommendations:

- Keep `5.6-hybrid-balanced` as the daily default.
- Keep `5.5-no-spark-balanced` available for UI-heavy work; three corrected UI runs passed for both profiles, while GPT-5.5 averaged 27.9 minutes versus 51.0 minutes for Hybrid.
- Use `5.6-sol-quality` selectively rather than promoting it globally.
- Compare profiles per task category and repeat runs before treating small differences as conclusive.

Evidence:

- [`wiki/testing/model-comparison-fixtures/results-2026-07-09.md`](../wiki/testing/model-comparison-fixtures/results-2026-07-09.md)
- [`wiki/testing/model-comparison-fixtures/results-followup-2026-07-10.md`](../wiki/testing/model-comparison-fixtures/results-followup-2026-07-10.md)

## Estimate-only agent balances

For Pi-supported providers without native quota APIs, PIDEX also has estimate-only balance tracking in the dashboard:

- balance snapshots are stored in `<pidex-root>/config/balance.json`
- Settings lets you record current balance or top-up snapshots
- Usage shows estimated current balance, burn, and runway based on manual snapshots plus PIDEX token metrics

This is advisory only. It does not replace provider-native billing or quota pages.
