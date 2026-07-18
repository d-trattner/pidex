# PIDEX Enhancement Review — Framework & Architecture

- **Date:** 2026-07-18 10:17:49
- **Type:** General improvement/enhancement review (senior-programmer lens, no review skill)
- **Scope:** Framework architecture only. Code-level findings (index.ts size, plan-key duplication) are covered by the thermo-nuclear reviews and only referenced here where they have architectural causes.
- **Method:** Full read of orchestrator skill, agents, rules, modules, quality-governance subsystem; comparison against current agentic-pipeline literature (2025–2026 papers listed at the end).

---

## Executive summary

PIDEX is, by the standards of the current literature, an unusually complete system: it already implements ideas that most published frameworks treat as future work — file-native context instead of RAG, operator contracts with evidence-based quality reports (PDQ), proportional minimal-run intent, parallel review lanes with adjudication, and a rule-based self-improvement loop. The gaps are not missing features. They are almost all the same gap in different clothes: **behavior that should be deterministic code is expressed as prose instructions that a long-context orchestrator LLM must remember and execute reliably.** The research on context rot says exactly this is the failure mode that gets worse as sessions grow — and PIDEX's own Plan 24 telemetry (67% subagent stall rate, orchestrator-driven recovery) is empirical confirmation from inside the project.

Seven proposals follow, ordered by expected payoff. E1–E3 are the structural ones; E4–E7 are opportunistic.

---

## E1. Move the pipeline state machine out of the prompt and into a helper

**Observation.** `skills/pidex/SKILL.md` is 1,440 lines. The orchestrator LLM is asked to: track per-gate/per-plan rejection counters and residual re-slice counters across an entire session ("cumulative circuit breaker"), run a 3-step stall check with grep commands after every agent return, distinguish RATE_LIMIT_ABORT from genuine stalls via telemetry inspection, remember which OpDecisions it owes, emit paired lifecycle events around every spawn, and honor Execution Profile skips only when five conditions all hold. Each of these is a deterministic function of observable state.

**Literature.** The harness-engineering line of work (Code as Agent Harness, arXiv:2605.18747; Datadog's observability-driven harness work; Confucius Code Agent, arXiv:2512.10398) converges on one principle: the model decides, the harness verifies and enforces. Every invariant enforced in the harness is an invariant the model cannot forget at token 150k. Context-rot studies (MindStudio 2026 summaries of needle benchmarks; Anthropic's context-engineering cookbook) show recall of mid-context instructions degrades precisely for the long, multi-plan sessions PIDEX runs.

**PIDEX evidence.** SKILL.md itself documents the failure class it is trying to prompt away: Plan 24's 8/12 stalls, PROC-NEW-12 rate-limit formalization, the G9-double-rejection rule. Each incident produced *more prose*. The prose is now the risk.

**Proposal.** Add a `pipeline-state` capability (fits the existing `run-check.mjs --capability` pattern; state under `state/pipeline-state/<project>/<plan>.json`):

- `advance --from <agent> --verdict <v> --gate <g>` → returns next route computed from a **data-encoded route graph** (see E2), current counters, and Execution Profile. Increments rejection/re-slice counters itself and returns `CIRCUIT_BREAKER_TRIPPED` with the three canonical user choices when thresholds hit.
- `check-return --agent <a> --result-json <path> --doc <path>` → performs the RATE_LIMIT_ABORT pre-check and the 3-step stall check (ROUTING presence, pending-marker ratio, commit delta) and returns a typed classification plus the prescribed recovery action.
- `pending-decisions` → lists OpDecisions the current route implies but which have not been recorded, so PDQ gaps are caught at the moment they occur instead of at report time.

SKILL.md then shrinks to: interview flows, judgment calls, and "call the helper; obey its output." Rough estimate: 500+ lines of mechanical instruction become ~40 lines, and the circuit breaker becomes impossible to forget. This also makes stall handling testable — today the recovery table cannot have a `.tdd.test.mjs`, which is an anomaly in a codebase where nearly everything else does.

**Effort:** medium. **Risk:** low — it encodes rules that already exist; behavior parity is checkable against SKILL.md text.

---

## E2. Encode the route graph as data, not markdown tables

**Observation.** The default route graph lives as a markdown table inside SKILL.md; the skip conditions, mandatory triggers, and proportionality guard live as surrounding prose; and `config/agents.json` holds a parallel partial encoding (`condition: plan_has_ui_scope`). Three representations of routing truth, none machine-checkable.

**Literature.** AdaptOrch (arXiv:2602.16873) argues orchestration topology is now a first-class optimization target — its measured 12–23% improvement comes from *selecting* topology per task rather than hardcoding one. The 180-configuration study surfaced in the verification-overhead literature found coordination becomes net-negative past a capability ceiling, and error amplification is architecture-dependent. You cannot tune what you cannot represent.

**Proposal.** `config/route-graph.json`: nodes (agents/gates), edges keyed by verdict, per-edge conditions (`ui_scope`, `security_scope`, `minimal_intent`), mandatory-trigger overrides, and named profiles (`conservative`, `minimal`, `hardened`) as edge subsets. The E1 helper consumes it; the dashboard can render it; `validate.mjs` can lint it (no dead nodes, every rejection edge has a circuit-breaker bound); PDQ can join findings against it. Task classification (Step 8) then becomes "select profile + entry node" — a data operation with an audit trail, instead of prose the user confirms and the LLM hopefully applies.

This is also the enabler for genuine task-adaptive routing later: once routes are data, "Structural → architect-first" and any future learned adjustments are config diffs, not skill-file edits.

**Effort:** small–medium. **Risk:** low.

---

## E3. Close the loop: let PDQ data tune the pipeline, not just report on it

**Observation.** PIDEX collects exceptional telemetry — per-agent metrics, pipeline events, operator decisions, contract violations, rejection loops, stall recoveries. Today that data flows to reports and dashboards, and process change happens through `pidex-pi` proposing rule edits. Rule edits are unmeasured: nothing attributes later outcomes to a specific rule change.

**Literature.** This is the strongest current result relevant to PIDEX's design. The multi-agent verification work (arXiv:2511.16708) demonstrates — with submodularity proofs and measured gains of +14.9/+13.5/+11.2pp for successive verifiers — that review layers have steeply diminishing returns; independent practice reports put ~75% of reachable improvement in the first two review rounds. PIDEX runs up to five sequential review gates plus optional secondary lanes. The proportionality guard shows the project already suspects this; but the guard is keyed to *user phrasing* ("minimal", "MVP"), not to *measured gate value*.

**Proposal.** Three increments:

1. **Per-gate marginal-catch metric.** For each gate, from existing events: how often it rejects, how often its rejection leads to a real change (vs. scope expansion, vs. later re-approval unchanged), and cost (wall time, tokens via the pricing code already in the extension). Emit into PDQ reports as a "gate yield" table.
2. **Evidence-based profile suggestions.** When gate yield for, say, `pidex-security` on docs-only or pure-UI plans is ~0 over N runs, PDQ proposes an Execution Profile adjustment — through the existing contract-governor proposal path, so it stays reviewed and fail-closed, disabled by default.
3. **Rule-efficacy attribution.** Tag rules with ids (many files already are, e.g. PROC-NEW-12); when `pidex-pi` lands a rule change, record it as an event; PDQ trend views then show before/after on the metrics the rule targeted. This upgrades the self-improvement claim from "we write rules after retros" to "we keep rules that measurably help" — which is the whole PIDEX thesis, applied to itself. It is also what the ACE line of work (evolving-playbook contexts refined via generate–reflect–curate) identifies as the missing curation step in most rule-accreting systems: rules only ever get added, never validated or retired, and instruction mass itself becomes context-rot load on every agent that reads it.

**Effort:** medium (1 is small; 2–3 build on governor/PDQ infra). **Risk:** low if suggestions stay proposal-only.

---

## E4. Deterministic context-pack builder

**Observation.** Every spawn requires a "compact manual context pack" marked `CONTEXT-PACK-MANUAL` — assembled by the orchestrator LLM by hand, with a "soft" budget check. Pack quality is therefore invisible and unmeasured, yet pack quality is the main lever on child-agent success and cost.

**Literature.** Context-engineering results are consistent: structured, curated, budgeted context beats ad-hoc pasting (Structured Context Engineering, McMillan 2026; Mise en Place for Agentic Coding, arXiv:2605.05400; Anthropic's compaction guidance). Long-horizon harness work (arXiv:2605.18747) frames it as an explicit decide-per-artifact policy: active context vs. summary vs. offloaded handle.

**Proposal.** `context-pack.build --agent <a> --plan <p> --project <root>` → given the route graph (E2), it knows each agent's canonical inputs (planner: epic + CONTEXT.md + roadmap slice; implementer: approved plan + critique verdict + boundary block; reviewer: diff + plan acceptance section), assembles paths + head-snippets under an explicit token budget, writes the pack to `agents.output/context-packs/`, and emits `OpContextPack` (the operator contract already exists!). The orchestrator may append judgment items on top. Packs become inspectable artifacts, budgets become hard numbers, and PDQ can correlate pack size/shape with stall and rejection rates — feeding E3.

**Effort:** medium. **Risk:** low; keep the manual path as fallback.

---

## E5. Episodic memory retrieval at spawn time

**Observation.** PIDEX writes excellent episodic records — retrospectives, PI proposals, operator decisions, ADRs — but nothing *reads them back* at the moment they would help. A planner starting a migration epic does not see that a similar migration two plans ago failed on horizontal slicing; that lesson only survives if it was promoted into a global rule (heavyweight, unmeasured — see E3) or if the user remembers.

**Literature.** MAAD (arXiv:2606.01385, TOSEM) attributes much of its quality gain to a three-layer memory (working / episodic / semantic) where episodic design history is retrieved into new tasks. AdMem (arXiv:2606.06787) and the deep-agents memory work make the same point: file-based persistence alone is storage, not memory — retrieval at decision time is what changes outcomes. PIDEX's wiki philosophy ("explicit, reviewable, close to the source") is compatible: the fix is not a vector DB, it is a retrieval *step*.

**Proposal.** Smallest useful version, consistent with the no-RAG stance: at pack-build time (E4), grep-match the task classification + epic keywords against a maintained index of retro "Planning Insights", ADR titles, and G9-rejection repro contracts for the project; include the top 2–3 as handles (path + one-line summary) in the planner/architect pack. A `memory-index.rebuild` capability keeps a small JSONL index; wiki-hygienist already owns adjacent territory and can own staleness. Measure via E3 whether retrieved-lesson runs reject less.

**Effort:** small–medium. **Risk:** low.

---

## E6. Give the extension an internal library layer (architectural cause of the thermo findings)

**Observation.** The two thermo reviews document the symptom (3,884-line `index.ts`, 9 drifted plan-key normalizer copies). The architectural cause: there is no shared library layer between the TypeScript extension and the ~dozen `scripts/**` and `modules/**` mjs entrypoints, so every entrypoint re-implements normalization, event emission, and path resolution. The module system solved ownership boundaries for *features* but not for *shared code*.

**Proposal.** A `lib/` workspace package (plain ESM, importable from both TS and mjs): `plan-key.mjs`, `events.mjs`, `paths.mjs`, `routing-block.mjs` (single ROUTING parser — parsing drift here silently corrupts routing, the pipeline's spinal cord). Then the index.ts decomposition proposed in the thermo review becomes mostly file moves. Add a parity test asserting every entrypoint resolves plan keys through the shared function — turning the current drift class into a CI failure. Do this *before* E1/E4 add new helpers, or they will mint copies 10 and 11.

**Effort:** small–medium. **Risk:** low.

---

## E7. Async/background mode: adopt the checkpoint-handoff pattern rather than reviving Telegram relay

**Observation.** Background mode is scaffolded but explicitly unshipped; the docs steer users back to direct mode, and notify-only Telegram is the sanctioned remnant. The pending design question is what background mode should even be.

**Literature.** Effective Strategies for Asynchronous Software Engineering Agents (arXiv:2603.21489) and the governable-agentic-SE case study (arXiv:2607.01087) point away from interactive-relay designs toward **checkpoint semantics**: the pipeline runs unattended until a gate, serializes a complete resumable state (E1 makes this nearly free — the state file *is* the checkpoint), notifies, and any later session resumes from the checkpoint. Gate decisions become durable recorded artifacts (OpGate + OpDecision — already modeled) instead of live replies. This yields "answer G4 tomorrow morning from a fresh session" without owning a chat-reply protocol, and it degrades gracefully: direct mode is just the special case where the same session resumes immediately.

**Effort:** medium, but mostly falls out of E1. **Risk:** medium (new lifecycle surface); keep fail-closed like Project Pipeline.

---

## What was considered and deliberately not proposed

- **RAG/vector retrieval over the wiki** — the file-native, explicit-context stance is supported by current evidence (AGENTS.md evaluation, arXiv:2602.11988; structured-context results); E5 gets the retrieval benefit without the machinery.
- **More agents or more review lanes** — the diminishing-returns evidence (E3) argues the frontier is *fewer, better-targeted* gates.
- **Dynamic free-form orchestration** (orchestrator picks any next agent at runtime) — the pipeline-vs-orchestrator-driven comparisons don't show wins for coding workflows large enough to justify losing PIDEX's auditability; E2's profile selection captures the useful middle ground.
- **Third-party module registry** — correctly deferred in the modules roadmap; nothing in this review depends on it.

## Suggested sequencing

1. **E6** (shared lib) — unblocks everything, kills the drift class.
2. **E2 → E1** (route graph as data, then state-machine helper) — the core de-prompting move.
3. **E4** (context packs) then **E5** (episodic retrieval into packs).
4. **E3** (gate yield → governed tuning) — highest leverage, benefits from E1/E2/E4 telemetry.
5. **E7** (checkpoint background mode) — when E1 state files exist.

---

## Sources

- [AdaptOrch: Task-Adaptive Multi-Agent Orchestration (arXiv:2602.16873)](https://arxiv.org/abs/2602.16873)
- [Bridging Requirements and Architecture: Multi-Agent Orchestration with External Knowledge and Hierarchical Memory — MAAD (arXiv:2606.01385)](https://arxiv.org/html/2606.01385v1)
- [Multi-Agent Code Verification via Information Theory (arXiv:2511.16708)](https://arxiv.org/pdf/2511.16708)
- [Code as Agent Harness (arXiv:2605.18747)](https://arxiv.org/pdf/2605.18747)
- [Effective Strategies for Asynchronous Software Engineering Agents (arXiv:2603.21489)](https://arxiv.org/pdf/2603.21489)
- [Cheap Code, Costly Judgment: Governable Agentic Software Engineering (arXiv:2607.01087)](https://arxiv.org/pdf/2607.01087)
- [Confucius Code Agent: Scalable Agent Scaffolding (arXiv:2512.10398)](https://arxiv.org/pdf/2512.10398)
- [Mise en Place for Agentic Coding: Deliberate Preparation as Context Engineering (arXiv:2605.05400)](https://arxiv.org/pdf/2605.05400)
- [Evaluating AGENTS.md: Are Repository-Level Context Files Helpful? (arXiv:2602.11988)](https://arxiv.org/html/2602.11988v1)
- [AdMem: Advanced Memory for Task-solving Agents (arXiv:2606.06787)](https://arxiv.org/pdf/2606.06787)
- [Harness Engineering for Agentic AI Coding Tools (arXiv:2602.14690)](https://arxiv.org/pdf/2602.14690)
- [Closing the verification loop: observability-driven harnesses (Datadog)](https://www.datadoghq.com/blog/ai/harness-first-agents/)
- [Context Management for Deep Agents (LangChain)](https://www.langchain.com/blog/context-management-for-deepagents)
- [Context engineering: memory, compaction, and tool clearing (Claude Cookbook)](https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools)
- [Context Rot in AI Coding Agents (MindStudio)](https://www.mindstudio.ai/blog/context-rot-ai-coding-agents-how-to-prevent)
- [LLM Verification Loops: Best Practices and Patterns (T. Williams)](https://timjwilliams.medium.com/llm-verification-loops-best-practices-and-patterns-07541c854fd8)

*Note: MAAD was read via abstract and introduction; other arXiv sources via abstracts and search-result summaries.*
