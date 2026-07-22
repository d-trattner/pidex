# Provider Limits and Profiles

PIDEX tracks provider-native Codex quota windows and uses profiles to switch complete agent-routing configurations. The supported catalog contains three GPT-5.6 profiles; none currently routes to Spark.

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

Spark alerts are suppressed when the active profile does not route to Spark.

Override this behavior with:

```bash
PIDEX_PROVIDER_ALERT_SPARK_WHEN_INACTIVE=1
```

## Spark limit protection

No supported profile currently uses Spark, so Spark exhaustion cannot alter active routing. Provider governance retains a fail-closed exact-pair mechanism for a possible future `<name>-plus-spark-*` profile: it may switch only when the corresponding `<name>-no-spark-*` profile exists. It never selects an unrelated fallback profile.

## Profile files

Profiles live under:

```text
<pidex-root>/config/profiles/*.json
```

The active routing config is controlled by PIDEX provider/profile logic and surfaced in the dashboard Usage and Settings sections.

List or activate a profile from the canonical checkout:

```bash
cd ~/pidex
node scripts/modules/run-check.mjs --capability provider-governance.probe --agent orchestrator --phase maintenance --project . -- use 5.6-hybrid-balanced
```

Activating a profile replaces `config/agents.json` with that complete preset. Commit profile files, but treat `config/agents.json` as the currently selected routing configuration.

## GPT-5.6 profiles

### `5.6-hybrid-balanced`

The recommended general-purpose default uses each GPT-5.6 variant for the roles where it is intended to be strongest:

- **Sol high:** analyst, architect, code reviewer, designer, planner, QA, roadmap, and security
- **Sol medium:** critic
- **Terra high:** implementer
- **Terra medium:** devops, Pi, and UAT
- **Luna medium:** retrospective

The assignments come from all-role C1 screening plus independent H2 holdouts. Security uses Sol high rather than xhigh after five stable high-effort security attempts.

### `5.6-hybrid-lowcost`

An explicitly selected token-efficient profile. It is route-equivalent to Balanced except:

- **Code Reviewer:** Terra medium instead of Sol high
- **QA:** Terra medium instead of Sol high

Repeated H2 measurements retained the core outcome while materially reducing observed input/output/cache-read tokens. Designer stays on Sol high in the initial Lowcost profile because Sol had the stronger persisted-turn and retry semantics. Lowcost is never selected automatically and does not use Spark.

### `5.6-sol-quality`

Routes every PIDEX role to `openai-codex/gpt-5.6-sol`. This preset is useful for controlled quality-focused comparisons and unusually difficult reasoning work. It is not the recommended broad default: follow-up evaluation passed UI and structural-refactor scenarios but failed the API-security scenario because the implementation used the wrong token environment variable.

## Benchmark guidance

Controlled real `/pd` fixture runs produced these practical recommendations:

- Keep `5.6-hybrid-balanced` as the quality-oriented daily default.
- Select `5.6-hybrid-lowcost` explicitly when token conservation is more important than maximum review/evidence depth.
- Use `5.6-sol-quality` selectively rather than promoting it globally.
- Keep retired GPT-5.4/GPT-5.5 routing as historical benchmark evidence rather than selectable production profiles.
- Compare profiles per task category and repeat runs before treating small differences as conclusive.

Evidence:

- [`wiki/testing/model-comparison-fixtures/results-2026-07-09.md`](../wiki/testing/model-comparison-fixtures/results-2026-07-09.md)
- [`wiki/testing/model-comparison-fixtures/results-followup-2026-07-10.md`](../wiki/testing/model-comparison-fixtures/results-followup-2026-07-10.md)
- [`wiki/completed/038-gpt56-balanced-and-spark-profile-evaluation/final-routing-table-2026-07-22.md`](../wiki/completed/038-gpt56-balanced-and-spark-profile-evaluation/final-routing-table-2026-07-22.md)
- [`wiki/completed/038-gpt56-balanced-and-spark-profile-evaluation/lowcost-routing-candidate-2026-07-22.md`](../wiki/completed/038-gpt56-balanced-and-spark-profile-evaluation/lowcost-routing-candidate-2026-07-22.md)

## Estimate-only agent balances

For Pi-supported providers without native quota APIs, PIDEX also has estimate-only balance tracking in the dashboard:

- balance snapshots are stored in `<pidex-root>/config/balance.json`
- Settings lets you record current balance or top-up snapshots
- Usage shows estimated current balance, burn, and runway based on manual snapshots plus PIDEX token metrics

This is advisory only. It does not replace provider-native billing or quota pages.
