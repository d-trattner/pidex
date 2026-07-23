# Provider Limits and Profiles

PIDEX tracks provider-native Codex quota windows and uses profiles to switch complete agent-routing configurations. The supported catalog contains three evidence-selected GPT-5.6 profiles. Spark was evaluated across the role matrix but is not routed by the current catalog.

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

## Evaluation evidence

The routing decision used controlled test-server fixtures rather than model reputation alone:

- an initial five-fixture benchmark;
- all-role C1 screening over 14 role-specific fixtures, 86 hidden truths, and 185 deterministic positive, negative, and anti-gaming evaluator cases;
- independent H2 holdouts with repeated attempts for every proposed Balanced route change and Lowcost reduction;
- manual disposition when strict evaluators and source-grounded human review disagreed.

Spark was tested throughout that process. It was not competitive with the selected Sol, Terra, and Luna routes as a general profile:

- Spark high produced the only Implementer functional failure in the initial screen;
- Critic Spark medium reached 0.778 recall versus 0.944 for Sol medium and had more critical omissions;
- DevOps Spark missed stale post-restart health ordering in two of three attempts, while Terra caught it in all three;
- Retrospective Spark was structurally valid in only two of three attempts and had weaker remediation ownership;
- UAT Spark high was the only eligible offload, but was roughly three times slower than Terra medium in the holdout and one infrequent route did not justify a separate profile and atomic fallback lifecycle.

“Not selected” is an evidence-bounded profile decision, not a claim that Spark can never perform useful work. A future evaluation may reconsider it against new models or new task categories.

## Operational safety evidence

Profile selection does not replace orchestration limits. In a separate anonymized real-project run, prompt-only breakers still allowed 218 specialist dispatches, 23.86 specialist-hours, 4,870 turns, 11,371 tool calls, and approximately USD 225.76 in estimated specialist cost before manual termination. A fresh real-project acceptance run later completed with one approved initial dispatch per applicable gate, no family-budget reset, no correction loop, and no leaked fixture process after executable cumulative review budgets were enabled.

The lesson is not that one model caused the incident. Strong models can all produce excessive implementation or evidence work when orchestration repeatedly reopens authority. PIDEX therefore combines evidence-selected routing with independent, model-agnostic dispatch limits.

## Benchmark guidance

Controlled real `/pd` fixture runs produced these practical recommendations:

- Keep `5.6-hybrid-balanced` as the quality-oriented daily default.
- Select `5.6-hybrid-lowcost` explicitly when token conservation is more important than maximum review/evidence depth.
- Use `5.6-sol-quality` selectively rather than promoting it globally.
- Keep retired GPT-5.4/GPT-5.5 routing as historical benchmark evidence rather than selectable production profiles.
- Compare profiles per task category and repeat runs before treating small differences as conclusive.

Detailed fixture outputs, holdout tables, and routing-decision records remain in the local PIDEX project wiki and are intentionally not included in the public npm package. The profile descriptions and recommendations above are the public release summary.

## Estimate-only agent balances

For Pi-supported providers without native quota APIs, PIDEX also has estimate-only balance tracking in the dashboard:

- balance snapshots are stored in `<pidex-root>/config/balance.json`
- Settings lets you record current balance or top-up snapshots
- Usage shows estimated current balance, burn, and runway based on manual snapshots plus PIDEX token metrics

This is advisory only. It does not replace provider-native billing or quota pages.
