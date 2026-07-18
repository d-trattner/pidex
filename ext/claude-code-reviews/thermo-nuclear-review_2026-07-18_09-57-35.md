# Thermo-Nuclear Code Quality Review — pidex

- **Date:** 2026-07-18 09:57:35
- **Scope:** Whole codebase (read-only review; no code was modified)
- **Branch:** `master` @ `613ea5d` (clean working tree)
- **Lens:** thermo-nuclear-code-quality-review skill standards
- **Baseline:** delta-checked against the prior review `thermo-nuclear-review_2026-05-29_12-13-43.md`

---

## Verdict: CHANGES REQUESTED — and this time it's a regression, not just debt

The May review flagged two presumptive blockers: an oversized `extensions/pidex/index.ts` (then 1,829 lines) and a duplicated plan-key/ROUTING parser. Since then the codebase shipped an entire Project Pipeline feature set, Windows support, and quality governance — impressive velocity, and the test discipline (`*.tdd.test.mjs` files accompanying nearly every new module) is genuinely good. But both blockers were left open and both got materially worse:

- `index.ts` grew from **1,829 → 3,884 lines** (+112%).
- The plan-key normalizer went from **3 copies → at least 9 copies**, and they have **already drifted behaviorally**.

Two smaller items from the prior review were fixed (dead branch in `finalAssistantTextFromEvent`, the `exitCode` success-counting bug) — credit where due. But the structural trajectory is the wrong one: every new feature is being folded into the same catch-all file, and every new script is re-pasting the same normalizer. The cost of the decomposition is going up roughly linearly with time; it will never be cheaper than today.

---

## Blockers

### B1 (REGRESSION of prior B1). `extensions/pidex/index.ts` is now 3,884 lines — the prior blocker doubled instead of shrinking

The file now owns at least ten unrelated jobs: runtime-root resolution and ~30 path constants (with per-path env overrides), tool-name/routing config, sandbox config + policy + tool-call inspection, Project Pipeline mode resolution and run-flow glue, the entire `pdproject` CLI (parser, usage text, ~15 `summarize*` formatters, dispatcher), plan-key/ROUTING text mining, operator-event + metrics persistence, pricing/cost estimation, three full subprocess runners (`runRpAgent` ~280 lines, `runCliDelegate`, `runConfiguredAgent`), the `pidexaudit` report generator, host-agent boundary enforcement, and finally the extension entry point that registers 10 commands and 2 tools.

The bitter irony: roughly **900 lines (≈ lines 420–1300) are Project Pipeline glue**, and the codebase already has the correct home for it — `modules/pidex/project-pipeline/scripts/project-pipeline/` is a well-factored module family (`orchestrator.mjs`, `run-agent.mjs`, `lifecycle.mjs`, `preview.mjs`, `credentials.mjs`, `registry.mjs`, each with its own test file). `index.ts` already talks to those helpers exclusively via `spawnSync` on script paths. The host-side command parsing, summarizing, and dispatch layer has no reason to live in the extension entry file; it is textbook feature logic leaked into a shared path.

**Remedy (pure move, no behavior change):** the May review's proposed decomposition still applies verbatim; add to it:

```
extensions/pidex/
  index.ts                     // entry point: hooks + registerCommand/registerTool wiring only
  paths.ts                     // PACKAGE_ROOT resolution + the ~30 path constants
  project-pipeline/command.ts  // parsePdProjectArgs, pdProjectUsage, runPdProjectCommand, all summarize*
  project-pipeline/mode.ts     // mode resolution, chooseProjectPipelineMode, run-flow glue
  sandbox/policy.ts            // sensitiveSandboxPath, sandboxHostBashAllowed, inspect* hooks
  runners/{pi,delegate,index}.ts
  events.ts / pricing.ts / plan-key.ts / commands/audit.ts
```

Do it before the next feature lands. At 3,884 lines with ~200 top-level functions, this file is past the point where a reviewer can hold it in their head, which defeats the purpose of the review-heavy pipeline the project itself champions.

### B2 (REGRESSION of prior B2). The plan-key normalizer is now copy-pasted in at least 9 places — and has already drifted

Current copies of the "coerce to `plan-NNN`" rule:

| Location | Variant |
|---|---|
| `extensions/pidex/index.ts:1888` | `normalizeExtractedPlan` (regex-mining dialect) |
| `extensions/pidex/index.ts:1922` | `normalizePlanKey` |
| `extensions/pidex/index.ts:2383` | `normalizePlanArg` |
| `scripts/quality/preflight.mjs:14` | `normalizePlan` (exact + `[-_]` prefix forms) |
| `scripts/quality/operator-decisions.mjs:57` | `normalizePlan` (same as preflight) |
| `scripts/quality/run-auto-pdq.mjs:11` | `normalizePlan` (same as preflight) |
| `scripts/quality/rule-actions.mjs:9` | `normalizePlan` (same family) |
| `scripts/quality/orchestrator-events.mjs:10` | `normalizePlan` — **drifted: exact-match only** |
| `scripts/dashboard/ingest.mjs:208–228` | `normalizePlanNumber` + `normalizePlanKey` + `normalizePipelinePlanKey` |
| `modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs:10` | `normalizePlan` |

The drift is no longer hypothetical: `orchestrator-events.mjs` only matches `^(?:plan-)?(\d{1,3})$`, so an input like `plan-12-refactor` normalizes to `plan-012` in preflight/operator-decisions/run-auto-pdq but passes through **unchanged** in orchestrator-events. Plan keys are the join key for the entire quality read model (metrics, operator events, PDQ reports, dashboard ingest); two dialects of the join key means silently mis-grouped evidence — precisely the data PIDEX's self-improvement loop depends on. This is the highest-leverage fix in the repo and it is small: one `scripts/lib/plan-key.mjs` (importable from both the `.mjs` scripts and the extension), delete the other eight copies. Same for the ROUTING-block grammar, which is now parsed independently in `index.ts`, `run-agent.mjs:34`, and `live.tsx:176`.

### B3 (carried from prior S1, unfixed). The "pipeline completed" predicate is still duplicated 6× as inline SQL in `dashboard/lib/server/api.ts`

`grep -c "pidex-devops','pidex-roadmap"` still returns 6; the gate predicate (`gate != 'none'`) still appears 4×. The business rule for "what counts as a completed pipeline" remains a 6-site find-and-replace, and the `getLiveState` variant still differs (includes `APPROVED`). Unchanged finding, unchanged remedy: SQL fragment constants in `db.ts`, one shared CTE builder. This would also cut `api.ts` (734 lines) well back from the 1k line it is drifting toward.

---

## Spaghetti / branching complexity

### S1. `parsePdProjectArgs` is 147 lines of seven near-identical hand-rolled flag loops

`extensions/pidex/index.ts:793–940`. Each of `preview`/`status`/`diagnose`/`runs`/`show-run`/`artifacts`/`open`/`repair`/`credentials`/`remove` re-implements the same loop: scan tokens, handle `--project-id`, maybe `--confirm`/`--run-id`, accept one positional, throw on anything else. The subtle inconsistencies are already visible — some branches check duplicate project ids, some don't; `runs|show-run|artifacts` shares one loop with `command !== "show-run"` special cases braided through it.

**Remedy (code judo):** a declarative spec table collapses all seven loops into one generic parser:

```ts
const PD_COMMANDS = {
  status:      { positional: "projectId", required: [] },
  diagnose:    { positional: "projectId", required: ["projectId"] },
  "show-run":  { positional: ["projectId", "runId"], required: ["projectId", "runId"] },
  repair:      { positional: "projectId", required: ["projectId"], confirmMustMatch: "projectId" },
  // ...
} as const;
```

One ~30-line interpreter plus the table replaces ~140 lines, and adding the next subcommand becomes a one-line change instead of another pasted loop. The existing `parsePdProjectArgs` tests transfer directly.

### S2. `QualityPage` is a single ~770-line React component

`dashboard/routes/quality.tsx` is 949 lines; the `QualityPage` function spans lines 178–945. All chart-data derivations, section renderings, and modal state live inline in one closure. The prior review suggested moving the pure transforms to `lib/client/quality-derive.ts` when the file was 566 lines; instead it grew 68%. Split by section (completion, runtime, model quality, trace findings, contract governor) into subcomponents and extract the pure derivations — they are unit-testable transforms trapped inside a component.

### S3. `runConfiguredAgent`'s retry/fallback ladder — carried, unfixed

The provider → retry → fallback-provider ladder with `fallbackFrom` threading and inline capability-guard result literals (prior S2) is still the shape of `runConfiguredAgent` (`index.ts:3002–3117`). The suggested "ordered attempt plan + isAcceptable predicate" restructuring still applies and would also naturally absorb the sandbox variant (`runSandboxedConfiguredAgent`).

### S4. `assertCodexQuotaAllowed` is still a shipped no-op — carried, unfixed

`index.ts:1874` still has the intentionally-empty body, with `providerLimitRecord`/`codexQuotaProviderFromModel` kept alive to feed it. Two months later this is no longer "temporarily disabled"; it is dead code wearing a seatbelt. Delete it (and its feeders) or gate it behind config.

---

## Boundary / type-contract problems

### T1. `QualityReadModelSummary` hand-redeclaration — carried, unfixed

`dashboard/routes/quality.tsx:89` still redeclares the entire server-side `QualitySummary` shape by hand (now alongside five more hand-declared payload types in the same file). The serialized contract across the API boundary is still maintained as two independent literals. Export from `lib/server/quality.ts` (or a shared `types/`) and import.

### T2. `AnyRecord`/`any` at the tool boundary

`quality.ts` still leans on `AnyRecord` internally (prior T2, unfixed), and the pattern has spread to the newest code: `runProjectPipelineAgentTool(params: any)`, `buildPdProjectCommandFromToolParams(params: any)`, `safeProjectMirrorSummary(mirror: any)`, `summarizeProjectRunLine(projectId, run: any)` — while typebox schemas (`PidexProjectParams`, `RpAgentParams`) exist right next to them. The schema is already the single source of truth for the shape; derive the static type (`Static<typeof PidexProjectParams>`) and use it, so the `String(params.agent)` re-coercion scattered through these functions disappears.

### T3. 15 `PIDEX_*` env-overridable path constants as ad-hoc test seams

The `const X_SCRIPT = process.env.PIDEX_X_SCRIPT ?? path.join(...)` pattern is repeated ~10 times for project-pipeline scripts alone (`index.ts:192–199`). This is a test seam that leaked into production config surface, one constant at a time. A single `resolveHelperScript("project-pipeline/run-agent.mjs")` with one documented override mechanism would collapse the block and stop the surface from growing per-feature.

---

## What's good (keep doing this)

- **Test discipline is excellent.** Nearly every new module ships with a `*.tdd.test.mjs` sibling — `orchestrator` (574 test lines), `project-pipeline-mode` (931), `run-agent`, `project-mirror`, `preview`, `lifecycle`. This is exactly what makes the decompositions above safe to execute.
- The **no-fallback philosophy** is applied consistently in the Project Pipeline layer — errors state explicitly that no host fallback was used. Clear failure semantics, clearly worded.
- `modules/pidex/project-pipeline/` itself is a **well-factored module family** — small focused scripts, each testable. The problem is not the module; it's that its host-side glue was bolted onto `index.ts` instead of following the same pattern.
- The subprocess runner's size guards, throttled updates, and graceful/hard-kill drain timers in `runRpAgent` remain carefully engineered.
- Prior findings S3 (dead branch) and T3 (exit-code success bug) were fixed and stayed fixed, with a regression test for the latter.

---

## Priority order

1. **B2 — extract `plan-key` (and ROUTING parser) into one shared module.** Smallest effort, highest leverage, and it closes an *active* data-integrity drift in the quality evidence pipeline that the whole self-improvement loop feeds on.
2. **B1 — decompose `index.ts`, starting with the ~900-line Project Pipeline glue** into `extensions/pidex/project-pipeline/`. Pure move; the tdd tests make it low-risk. Institute the rule the skill prescribes: no PR may grow this file further.
3. **B3 — single-source the SQL completion/gate predicates** in the dashboard read model; resolve the `APPROVED` divergence deliberately.
4. **S1 — table-drive `parsePdProjectArgs`**; do it as part of the B1 move so the new module starts clean.
5. **S2 — split `QualityPage`** and extract pure derivations.
6. **T1/T2 — share the quality contract type; derive tool param types from the typebox schemas.**
7. **S3/S4/T3 — cleanups** alongside the B1 move.

The headline is simple: the May review's two blockers were the cheap fixes then, and they are the expensive fixes now — one doubled, the other tripled. The velocity of the last two months is real, but it is being financed by the two exact debts the last review priced out. Pay them before the next feature; every one of the remedies above is a pure move or a mechanical dedup, fully covered by the existing test suite.
