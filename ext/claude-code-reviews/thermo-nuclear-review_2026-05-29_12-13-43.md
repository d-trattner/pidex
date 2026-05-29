# Thermo-Nuclear Code Quality Review — pidex

- **Date:** 2026-05-29 11:55:11
- **Scope:** Whole codebase (per in-conversation instruction to override the skill's default current-branch scope)
- **Branch:** `master` @ `b008439` (clean working tree)
- **Lens:** thermo-nuclear-code-quality-review skill standards (unchanged)
- **Source surface:** ~149 tracked source files (66 `.tsx`, 43 `.mjs`, 16 `.ts`); review concentrates on the largest/most central hand-written modules.

A note on scope: you asked me to "overwrite skill instructions." I read that as *widen the audit scope to the whole codebase* (which I did), not *lower the quality bar*. The skill's standards still apply. If you actually wanted a softer/looser review, say so and I'll redo it.

---

## Verdict: CHANGES REQUESTED

Behavior looks coherent and the code is more disciplined than most agent-orchestration glue (good size guards, defensive try/catch around best-effort I/O, sensible token/cost estimation). But there are two presumptive blockers under the skill's bar — one oversized file and one duplicated-helper-in-the-wrong-layer problem — plus several spaghetti/abstraction findings that are worth fixing before this grows further.

---

## Blockers

### B1. `extensions/pidex/index.ts` is 1,829 lines — a single file doing six unrelated jobs

This is the single biggest structural problem in the repo and a hard blocker under the skill's 1k-line rule. The file currently owns, in one module:

1. **Tool-name normalization & routing config** (`TOOL_ALIASES`, `normalizeToolName`, `resolveRoute`, provider predicates)
2. **Pricing / token / cost estimation** (`loadPricing`, `estimateCostUsd`, `estimateTokensFromChars`)
3. **ROUTING-block text parsing** (`extractRoutingBlock`, `extractRoutingField`, `extractPlanId`, and ~8 regex plan-extraction fallbacks)
4. **Operator-event + metrics persistence** (`appendOperatorEvent`, `recordOperatorEvents`, `recordAgentMetric`)
5. **Two full subprocess runners** (`runRpAgent` ~230 lines for Pi, `runCliDelegate` for Codex) plus the fallback orchestrator `runConfiguredAgent`
6. **Six slash-command handlers + the audit report generator** (`runRpAudit` is ~150 lines of markdown-table building on its own)

None of these need to share a module. The `export default function runningPi` at the bottom is the only true extension entry point; everything above it is library code that happens to live in the same file.

**Remedy (decomposition, not rearrangement):**
```
extensions/pidex/
  index.ts            // just registerCommand/registerTool wiring + the bash-guard hook
  routing/tools.ts    // TOOL_ALIASES, normalize*, parseTools, hasCustomTools
  routing/config.ts   // RoutingConfig types, loadRoutingConfig, resolveRoute, provider predicates
  pricing.ts          // loadPricing, estimateCostUsd, token estimators
  routing-block.ts    // extractRoutingBlock/Field, extractPlanId, normalizePlanKey  ← see B2
  events.ts           // appendOperatorEvent, recordOperatorEvents, recordAgentMetric, notifyGate
  runners/pi.ts       // runRpAgent + createAgentRunLog
  runners/delegate.ts // runCliDelegate
  runners/index.ts    // runConfiguredAgent (the only orchestration concern)
  commands/audit.ts   // parseRpAuditOptions, runRpAudit
```
This is a pure move; behavior is unchanged. The win is that the runner logic (the part most likely to change and most dangerous to break) stops sharing a file with markdown-table formatting.

### B2. `extractPlanId` / `normalizePlanKey` / `extractRoutingBlock` are duplicated across the extension and the scripts layer — with subtly different behavior

`scripts/quality/preflight.mjs` reimplements `normalizePlan` (its own copy of `index.ts`'s `normalizePlanKey`) and the extension has `normalizeExtractedPlan` doing yet a third variant of the same "coerce to `plan-NNN`" idea. There is no canonical plan-key module, so three slightly different normalizers can and will drift. `extractRoutingBlock`/`extractRoutingField` are called **10 and 16 times** respectively inside `index.ts` alone, and the same ROUTING-comment grammar is parsed nowhere else canonically — so any consumer outside this file (the dashboard ingest, future scripts) is forced to re-derive the regex.

This is the skill's "bespoke helper where a canonical utility should exist" / "logic in the wrong layer" blocker. The ROUTING block is a **data contract** between agents and the orchestrator; it deserves one parser module that both the extension (`.ts`) and scripts (`.mjs`) import, not three regex dialects.

**Remedy:** extract a single `plan-key.ts`/`routing-block.ts` (shippable as both ESM consumable by scripts and importable by the extension) that owns: plan-key normalization, ROUTING block extraction, and field extraction. Delete the `preflight.mjs` and `normalizeExtractedPlan` copies.

---

## Spaghetti / branching complexity

### S1. The completion predicate is copy-pasted **6 times** as inline SQL across `api.ts`

```sql
MAX(CASE WHEN ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi')
  OR ar.route_to IN ('pidex-roadmap','user')
  OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at
```
This exact "what counts as a completed pipeline" rule appears verbatim in `getSummary`, `listPipelines`, `qualityChartData` (twice — `gatesByPipeline` and `reworkByPipeline`), `completionByDay`, and a near-variant in `getLiveState`'s `inferredOpen` (which adds `APPROVED`). The "gate is non-empty" predicate (`ar.gate IS NOT NULL AND ar.gate != '' AND ar.gate != 'none'`) is duplicated **4 times**.

This is a missing-model smell. The definition of "pipeline completed" is now scattered across 6 SQL strings; changing the business rule means a 6-site find-and-replace, and `getLiveState` has *already* diverged (it includes `APPROVED`, the others don't — is that intentional or a bug?).

**Remedy:** define these as SQL fragment constants in `db.ts` (or a `sql-fragments.ts`):
```ts
export const COMPLETED_AT_EXPR = `MAX(CASE WHEN ar.agent IN (...) OR ar.route_to IN (...) OR ar.verdict IN (...) THEN ar.timestamp END)`;
export const HAS_GATE = `(ar.gate IS NOT NULL AND ar.gate != '' AND ar.gate != 'none')`;
```
and the four near-identical `WITH grouped AS (...)` CTEs in `api.ts` (`listPipelines`, `gatesByPipeline`, `reworkByPipeline`, `completionByDay`) collapse toward one shared builder. That alone removes a large fraction of `api.ts`'s 728 lines and makes the completion rule single-sourced.

### S2. `runConfiguredAgent` fallback flow is a three-stage retry ladder that's hard to scan

The fallback logic runs: try provider → maybe retry same provider once (if Pi + missing ROUTING) → maybe fall back to a different provider → then a wall of `fallbackProviderRaw`/`fallbackDisabled`/`configuredFallback`/`fallbackProvider` derivation. The `missingRouting`/`shouldFallback` pair is recomputed twice with identical expressions. This is incidental control flow that would read far better as an explicit small state machine or an ordered list of candidate attempts:
```ts
for (const attempt of buildAttemptPlan(provider, config, overrides)) {
  result = await runProvider(attempt.provider, attempt.fallbackFrom);
  if (isAcceptable(result)) break;
}
```
where `isAcceptable` centralizes the `exitCode === 0 && finalText && hasRoutingBlock` rule that's currently inlined and recomputed. Behavior preserved; the branching disappears.

### S3. `finalAssistantTextFromEvent` has a dead branch

**Status:** DONE — duplicate same-input branch removed.

```ts
const direct = textFromAssistantMessage(event?.message);
if (direct) return direct;
const turnEnd = textFromAssistantMessage(event?.message); // identical call, can never differ
if (turnEnd) return turnEnd;
```
The second call reads the same `event?.message` as the first, so it's unreachable-after-the-first dead code. Either it was meant to read a different field (`event?.turnEnd?.message`?) — in which case it's a latent bug — or it should be deleted. Flagged because "magic that looks intentional but isn't" is exactly the kind of thing that survives for years.

### S4. `assertCodexQuotaAllowed` is a no-op that still ships its scaffolding

```ts
function assertCodexQuotaAllowed(model) {
  if (!isCodexModel(model)) return;
  // intentionally disabled in this local branch
  return;
}
```
Combined with `providerLimitRecord` and `codexQuotaProviderFromModel`, which exist only to feed quota enforcement that is currently disabled — this is dead-but-load-bearing-looking code. If quota enforcement is genuinely deferred, leave a single TODO and delete the unused readers; if it's coming back, gate it behind a flag rather than an empty function body that reads as if it does something.

---

## Boundary / type-contract problems

### T1. `QualitySummary` is hand-redeclared as `QualityReadModelSummary` in `quality.tsx`

`dashboard/lib/server/quality.ts` exports `QualitySummary` (and `TraceFinding`, `RuleImpactSummary`, `TraceBreakdown`). `dashboard/routes/quality.tsx` then redeclares the *entire shape* inline as `QualityReadModelSummary` — every field, by hand. These two are a serialized contract across the API boundary; maintaining them as two independent literals guarantees drift the first time a field is added server-side. Export the type from the server module and import it (or a shared `types/quality.ts`) in the route. This is a textbook "shared contract over ad-hoc object shape" fix.

### T2. `AnyRecord = Record<string, any>` pervades the read model

`quality.ts` leans on `AnyRecord` and a fleet of `String(row?.x || 'unknown')` coercions for every field of an incoming JSON report. That's defensible at the *parse boundary* (untrusted JSON on disk), but right now the un-narrowed `any` flows deep — `summarizeQualityReport` reaches into `report.summary.operator_trace.findings` with no typed intermediate. Define a `RawQualityReport` input type for the on-disk shape and narrow once at `readReport`, so the rest of the module operates on typed data instead of re-coercing `any` at every property access.

### T3. `modelQuality` reads a field that doesn't exist on its own row type

**Status:** DONE — success predicate now checks `r.exit_code == null`, with a regression test covering failed rows.

```ts
g.success += (exitCode === 0 || r.exitCode == null || verdict === 'APPROVED' ...)
```
`r` is a `DbRow` selected with `ar.exit_code AS exit_code`; `r.exitCode` (camelCase) is never selected and is always `undefined`, so `r.exitCode == null` is *always true* — meaning **every run is counted as a success** regardless of exit code. This looks like a real bug hiding behind `DbRow`'s loose indexing (`exit_code` vs `exitCode`). A tighter row type on this query would have caught it at compile time. Worth verifying against intended success-rate semantics.

---

## File-size / decomposition (secondary)

- `dashboard/lib/server/api.ts` (728) — not over 1k, but S1's deduplication would cut it substantially and it's the natural next split candidate (summary / runs / pipelines / quality-charts / live could each be their own module behind a thin `api/index.ts`).
- `dashboard/routes/live.tsx` (575) and `quality.tsx` (566) are large for route components but acceptable; the `quality.tsx` chart-data derivations (`traceTypeData`, `severityData`, `operatorGapData`, `ruleImpactData`) are pure transforms that could move to a `lib/client/quality-derive.ts` to slim the component and make them unit-testable.

---

## What's good (keep doing this)

- The subprocess runner's **size guards** (`MAX_JSON_PARSE_LINE_BYTES`, oversized-line dropping, gzip child logs out of the parent session) are genuinely well thought through.
- Best-effort persistence consistently wrapped so it "must never break pidex_agent" — correct instinct for telemetry.
- `paginateTokenBuckets` extracted into its own module — exactly the kind of helper extraction the rest of `api.ts` needs more of.
- TDD test files (`*.tdd.test.mjs`) accompanying the new quality/preflight code.

---

## Priority order

1. **B2** — extract the canonical ROUTING/plan-key parser; it's the highest-leverage fix and removes real drift risk (and may surface a bug). Small, high-value.
2. **S1** — single-source the SQL completion/gate predicates; biggest readability + correctness win in the dashboard layer, and resolves the `getLiveState` divergence question.
3. **B1** — decompose `index.ts`. Larger effort; do it as a pure move once B2 has carved out the first module.
4. **T1 / T3** — share the quality type; investigate the `exitCode` success-counting bug.
5. **S2 / S3 / S4 / T2** — cleanups; do alongside the B1 move.

Nothing here questions whether the system *works* — it appears to. The objection is that the completion rule, the ROUTING grammar, and the plan-key format are each defined in multiple places, and the extension's entry-point file has become a catch-all. Fixing those three single-sourcing problems is the "code judo" that makes the next ten features cheaper.
