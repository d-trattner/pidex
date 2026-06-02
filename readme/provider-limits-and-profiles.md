# Provider Limits and Profiles

PIDEX tracks provider-native Codex quota windows and uses profiles to switch between Spark and no-Spark routing modes.

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

## Estimate-only agent balances

For Pi-supported providers without native quota APIs, PIDEX also has estimate-only balance tracking in the dashboard:

- balance snapshots are stored in `<pidex-root>/config/balance.json`
- Settings lets you record current balance or top-up snapshots
- Usage shows estimated current balance, burn, and runway based on manual snapshots plus PIDEX token metrics

This is advisory only. It does not replace provider-native billing or quota pages.
