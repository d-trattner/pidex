---
ID: 16722
Origin: 16722
UUID: a599839f
Status: Complete
---

# Plan 16722 DPR-04 Overengineering Incident Report for PIDEX Developer

## Report Boundary and Evidence Standard

Part A only. Sections 1–10 complete; sections 11–18 intentionally deferred to Part B. Pipeline: `pidex-ui-16722-20260718T113305Z`. Project: `C:/Users/Daniel/projects/pidex-ui`. Times use UTC (`Z`) unless commit time explicitly carries `+02:00`. Exact counts come from `C:/Users/Daniel/pidex/state/metrics/C-Users-Daniel-projects-pidex-ui/plan-16722.jsonl`, pipeline/operator JSONL, named artifacts, and Git. `Lower bound` means telemetry cannot prove full count.

## 1. Executive Summary

Plan 16722 delivered requested DPR-04 Quality UI and runtime path in four planned commits, then accumulated three remediation spawns and four more commits because review converted evidence completeness and process obligations into release blockers after broad suites had passed. Product work was not wholly unnecessary: R1 exposed valid paired-generation, privacy, invalid/future-state, typed-contract, and accessibility defects; R2 exposed one high-confidence same-root publication race and one reproduced Rust taxonomy mismatch. Both were fixed by HEAD `957fa9d9b4c4e91593ca1cb55e86b075509d0685`.

Demonstrable drift began no later than R2 publication at `2026-07-18T18:56:30.230Z`: second independent primary review expanded closure into recursive runtime DTO validation, exhaustive native-state proof, FR-1–FR-16 reachability ledger, full screenshot regeneration, and historical TDD evidence. Three of five R2 Majors had no reproduced runtime/user-value failure: CR-MAJ-6 evidence completeness, CR-MAJ-7 screenshot provenance, CR-MAJ-9 historical process evidence. R2 also breached user rule’s one-independent-review-cycle budget.

Circuit breakers limited single uninterrupted spawns but not cumulative work. Event-backed run ledger through `2026-07-18T19:37:05.655Z` records **39 agent runs**, **8 exit-code-1 timeout/failure runs**, **7 implementer runs**, **10 critic lane runs**, **8 code-review lane runs**, and **12,952,408 ms (3h 35m 52.408s) summed agent runtime**. Parallel lanes make summed runtime larger than wall-clock duration. Four explicit implementation slices became **7 implementer spawns** and **8 DPR-04 commits**. User/operator gates simplified scope repeatedly, but each reset changed local contract while preserving broad planned evidence machinery and allowing another review/remediation cycle.

Unauthorized repository side effects remain visible: modified `wiki/log.md` and untracked `pidex/`. Neither belongs to product commits. Exact current Git status: detached `HEAD` at `957fa9d`; ` M wiki/log.md`; `?? pidex/`.

## 2. Frozen Outcome, Invariants, Exclusions, and Accepted Decisions

### 2.1 Requested outcome

Add separate top-level `Execution | Quality` view over canonical DPR-03A PDQ reports. Preserve existing Execution shell and shared `Projects/Tests` cohort plus aggregate/project selection. Quality provides `Overview | History`. Native code performs exact project attribution; browser receives display-safe typed DTO only.

### 2.2 Frozen invariants

- Exact one-candidate mapping through existing path-backed project identity. No basename, slug, display-name, substring, current-working-directory, or registry-priority inference.
- Unmatched/ambiguous reports stay separately visible and excluded from project/cohort aggregates.
- Raw absolute paths, filenames, producer Comparability payload, report contents, and provenance tokens never cross browser boundary.
- Execution and Quality share one generation identity; Quality failure stays isolated from usable Execution.
- Every delivered occurrence remains visible. Equal newest project/time reports form unordered `Ambiguous latest evidence`; no winner or intra-group semantic order.
- History uses separate unconnected observations and exact semantic table. No trend line, delta, score, slope, causality, or inferred comparability.
- `generated_at` supports report recency only: `Current` ≤72h, `Stale` >72h and ≤168h, `Severely stale` >168h, `Unknown` for invalid/future.
- Shared scope persists across main-view switches; no independent Quality selector or persistence.
- Responsive/accessibility contract applies at 1440×900 and 390×844 with keyboard/focus/semantic/contrast behavior.
- Ordinary viewing performs no PDQ invocation, process/network/open action, writes, SQLite ingest, cache, persistence, review-state mutation, or authority expansion.

### 2.3 Frozen exclusions

M17/state/metrics telemetry; review state; governor/correction data; manual PDQ refresh; Usage; Documents; M10; writes/actions/persistence/SQLite/cache; generic path-taking reads; composite quality score; causal claims; renderer display cap; native fixture exporter/checked bridge; semver/version/tag/push/publish/deploy; external PIDEX changes; wiki/roadmap/ADR edits.

### 2.4 Accepted user decisions

| Exact event | Decision | Contract effect |
|---|---|---|
| Preflight pack, before pipeline start | Report-only DPR-04 | Deferred M17/state/metrics and review authority. |
| `2026-07-18T12:30:29.533Z`, operator event | Choice A | Comparability unavailable; History uses unconnected points + table; terminology is report recency. |
| `2026-07-18T14:52:53.417Z`, operator event | Choice A | Discard raw Comparability; equal-time group unordered; no provenance token/order promise. |
| `2026-07-18T15:37:10.100Z`, operator event | User approved preview | Approved temporary design at `http://127.0.0.1:4173/16722-dpr04-quality-intelligence-preview.html`. |
| `2026-07-18T18:27:29.729Z`, operator event | Choice A | Separate Rust native-attribution proof and browser presentation proof with Rust/TypeScript DTO parity; no native fixture exporter/checked bridge. |
| `2026-07-18T23:34:49.617Z`, operator event | Choice A+B | Implementation-first affected-scenarios-only closure; pause pipeline; incident report required first. |

## 3. Expected Implementation-First Behavior

User-authoritative rule, reproduced verbatim:

> Implementation-first: Freeze the requested outcome, invariants, exclusions, and acceptance criteria. Adjust the technical path only when evidence requires it. Use 10–15-minute checkpoints without interrupting atomic work. Follow reproduced failures to a controllable root cause or proven external blocker. Check adjacent areas only when they share the same writer, reader, contract, or data path, starting with one representative case. Every scope expansion requires a falsifiable, evidence-backed hypothesis. Stop branches with no causal link or requiring a separate deliverable. Stop the task once acceptance passes, the causal chain closes, and in-scope blockers are cleared. Run one independent review cycle; after fixes, revalidate only affected scenarios. External side effects require separate explicit authorization.

Expected run shape:

1. Freeze section 2 baseline and track only explicit user-approved deltas.
2. Implement four bounded vertical slices because approved plan already selected this technical path.
3. Checkpoint every 10–15 minutes at atomic boundaries; do not force partial interruption.
4. Run one independent review after four slices.
5. For each finding, require reproduced failure or falsifiable causal hypothesis tied to frozen criterion.
6. Fix valid product/shared-contract defects; rerun only affected scenarios.
7. Use one representative native/TypeScript/browser shared-contract case before broader adjacent checks.
8. Stop evidence branches lacking causal link or needing separate deliverable, including historical chronology reconstruction.
9. Stop product task when affected acceptance passes and causal blockers close.
10. Seek separate explicit authorization before wiki or other external/protected side effects.

## 4. Exact Chronology

Chronology below separates exact event time from ordered phase. Pipeline ID encodes start at `2026-07-18T11:33:05Z`. Run telemetry is exact only through `2026-07-18T19:37:05.655Z`; therefore 39-run and eight-timeout totals are lower bounds through final pause. Source: `C:/Users/Daniel/pidex/state/metrics/C-Users-Daniel-projects-pidex-ui/plan-16722.jsonl`, associated pipeline/operator events, Git, and named review artifacts.

| Time / order | Phase | Attempt, decision, or output | Continuation / scope effect |
|---|---|---|---|
| Before `2026-07-18T11:33:05Z` | Preflight | User froze report-only DPR-04. M17/state/metrics and review authority deferred. Four implementation slices selected. | Established baseline later used by R1/R2 evaluation. |
| `2026-07-18T11:33:05Z` | Pipeline start | Pipeline `pidex-ui-16722-20260718T113305Z` opened. Critic/design work began before implementation. | Start of ≥12h 1m 44.617s wall interval to final pause. |
| Before `2026-07-18T12:30:29.533Z` | Critic/design attempt cluster | Critics surfaced unresolved Comparability meaning. Work paused at operator gate rather than choosing semantics internally. | Bounded attempt ended; operator continuation requested. |
| `2026-07-18T12:30:29.533Z` | User contract gate 1 | Choice A: Comparability unavailable; unconnected observations plus semantic table; recency terminology only. | Narrowed product semantics. Pipeline continued. |
| `2026-07-18T12:30:29.533Z`–`14:52:53.417Z` | Critic/design continuation | Design/contract analysis continued and raised equal-time ordering plus provenance handling. | Another bounded continuation; broad design/evidence path remained active. |
| `2026-07-18T14:52:53.417Z` | User contract gate 2 | Choice A: discard raw Comparability; equal-time set unordered; no provenance token or ordering promise. | Removed browser provenance and semantic ordering obligations. Pipeline continued. |
| `2026-07-18T14:52:53.417Z`–`15:37:10.100Z` | Design continuation | Temporary DPR-04 preview completed at `http://127.0.0.1:4173/16722-dpr04-quality-intelligence-preview.html`. | Converted contract decisions into approved visual direction. |
| `2026-07-18T15:37:10.100Z` | Design approval | User approved preview. | Design gate cleared; four-slice implementation path authorized. |
| After `2026-07-18T15:37:10.100Z` | Slice 1 | First bounded vertical implementation slice completed and committed. | Planned product commit 1/4. |
| Next | Slice 2 | Second bounded vertical implementation slice completed and committed. | Planned product commit 2/4. |
| Next | Slice 3 | Third bounded vertical implementation slice completed and committed. | Planned product commit 3/4. |
| Next | Slice 4 | Fourth bounded vertical implementation slice completed and committed. | Planned product commit 4/4; requested implementation shape existed. |
| After four slices | Independent review R1 | First primary review cycle found paired-generation, privacy, invalid/future-state, typed-contract, and accessibility defects. | Findings had product/shared-contract causal links. Remediation justified. |
| R1 remediation | Remediation attempts/continuations | Three remediation implementer spawns occurred across incident; four commits were added beyond four planned commits. Broad tests passed during remediation. | Four-slice plan became seven implementer spawns and eight DPR-04 commits. Timeout/failure exits caused continuation, not cumulative stop. |
| `2026-07-18T18:27:29.729Z` | User contract gate 3 | Choice A: separate Rust native-attribution proof and browser presentation proof with Rust/TypeScript DTO parity; reject native fixture exporter/checked bridge. | Explicitly bounded shared-contract proof. Pipeline continued toward revalidation. |
| After R1 fixes, before `2026-07-18T18:56:30.230Z` | Revalidation / second review launch | Product fixes and broad suites cleared enough for another primary review. Instead of affected-scenario-only revalidation, independent R2 ran. | Breached one-independent-review-cycle budget. |
| `2026-07-18T18:56:30.230Z` | R2 publication | Five Majors published. Two concerned product/shared contract: same-root publication race and reproduced Rust taxonomy mismatch. CR-MAJ-6 demanded evidence completeness; CR-MAJ-7 screenshot provenance; CR-MAJ-9 historical TDD/process proof. | Earliest demonstrable scope drift. Three Majors lacked reproduced runtime/user-value failure. |
| `2026-07-18T18:56:30.230Z`–`19:37:05.655Z` | R2 remediation continuation | Valid R2 defects entered remediation. Recursive DTO validation, exhaustive native-state proof, FR-1–FR-16 reachability, screenshot regeneration, and historical TDD evidence remained blocking expectations. | Local timeout/pauses did not retire aggregate review obligations. |
| `2026-07-18T19:37:05.655Z` | Exact metrics cutoff | Ledger reached 39 runs: 8 exit-code-1 timeout/failure, 7 implementer, 10 critic lane, 8 code-review lane; summed runtime 12,952,408 ms. | Counts exact to cutoff, lower bound through final pause. |
| After metrics cutoff | Final remediation / HEAD | Valid R1/R2 product defects fixed. Repository reached detached HEAD `957fa9d9b4c4e91593ca1cb55e86b075509d0685`. Broad product acceptance had passed. | Product causal chain closed; evidence/process branches still prevented stop. |
| `2026-07-18T23:34:49.617Z` | Final user gate and pause | User selected Choice A+B: implementation-first, affected-scenarios-only closure; pause pipeline; produce incident report first. | Ended continuation loop. Explicitly rejected further recursive review/evidence expansion. |
| Current pause | Repository side effects | Detached `HEAD` at `957fa9d`; modified `wiki/log.md`; untracked `pidex/`. | External/protected changes remain outside authorized product commits. |

Timeout attribution limit: evidence proves eight exit-code-1 timeout/failure runs and subsequent continuations, but Part A source summary does not expose eight individual timestamps. Table therefore does not invent per-attempt times. Their cumulative operational effect is verified: no exit ended task; later implementer/review activity and final HEAD followed.

## 5. Work-Volume Accounting

### 5.1 Exact telemetry through cutoff

| Measure | Exact value | Math / interpretation |
|---|---:|---|
| Pipeline start | `2026-07-18T11:33:05Z` | From pipeline ID. |
| Metrics cutoff | `2026-07-18T19:37:05.655Z` | Event-backed run ledger endpoint. |
| Wall interval to cutoff | 8h 0m 0.655s | Cutoff minus encoded pipeline start. Not summed labor. |
| Agent runs | 39 | Exact to cutoff. Lower bound through final pause. |
| Exit-code-1 timeout/failure runs | 8 | 8/39 = 20.51% of recorded runs. Exact exits; telemetry does not distinguish every timeout from other exit-1 failure. |
| Recorded non-exit-1 runs | 31 | 39 − 8. Does not imply 31 useful or unique outcomes. |
| Implementer runs | 7 | 7/39 = 17.95% of all recorded runs. |
| Critic lane runs | 10 | 10/39 = 25.64%. |
| Code-review lane runs | 8 | 8/39 = 20.51%. |
| Critic + code-review lane runs | 18 | 18/39 = 46.15%. Lane labels reported as recorded; no claim that all review work was waste. |
| Other recorded runs | 14 | 39 − 7 − 10 − 8, assuming ledger lane buckets are disjoint as summarized. |
| Summed agent runtime | 12,952,408 ms | 12,952.408s = 215m 52.408s = 3h 35m 52.408s. |
| Mean summed runtime per run | 332,113 ms | 12,952,408 / 39 ≈ 5m 32.113s. Mean hides parallelism and retries. |

Correction to interpretation: summed agent runtime does **not** measure wall elapsed duration and does not include user-gate waiting. It may overlap across parallel lanes. Recorded wall interval to cutoff is 8h 0m 0.655s, larger than summed agent runtime here; neither number alone equals engineering labor.

### 5.2 Planned versus realized implementation

| Unit | Planned | Realized | Expansion |
|---|---:|---:|---:|
| Vertical implementation slices | 4 | 4 delivered | No product-slice expansion. |
| Implementer spawns | 4 expected minimum | 7 exact to cutoff | +3; 1.75× expected minimum; 75% increase. |
| DPR-04 commits | 4 planned | 8 at final HEAD | +4; 2× plan; 100% increase. |
| Remediation spawns | 0 in base slice count | 3 | Three continuation rounds beyond one-pass slice delivery. |
| Independent primary review cycles | 1 authorized | 2 | +1; 2× authorized count. |

Commit accounting is exact at HEAD even though only terminal commit ID is reproduced here: four planned slice commits plus four remediation commits = eight DPR-04 commits, ending at `957fa9d9b4c4e91593ca1cb55e86b075509d0685`.

### 5.3 Full incident lower bounds

| Interval / count | Lower-bound result | Why only lower bound |
|---|---:|---|
| Start to final pause | ≥12h 1m 44.617s wall | `23:34:49.617Z` minus pipeline start `11:33:05Z`; encoded start has second precision only. |
| R2 publication to final pause | 4h 38m 19.387s wall | Exact operator/review timestamps. |
| Metrics cutoff to final pause | 3h 57m 43.962s wall | Run ledger summary stops before final operator pause. |
| Runs through pause | ≥39 | Later interval may contain runs not represented by cutoff summary. |
| Exit-1 runs through pause | ≥8 | Same cutoff limitation. |
| Summed agent runtime through pause | ≥3h 35m 52.408s | Same cutoff limitation. |
| Product commits | 8 exact | Git/HEAD accounting, not telemetry estimate. |

Minimum proven overrun is therefore one unauthorized extra independent review, three extra implementer spawns, four extra commits, eight failed/timed-out run exits, and nearly four wall-clock hours after telemetry cutoff before user-enforced pause. Report does not convert those figures into cost because agent concurrency, idle gate time, and post-cutoff run detail are unavailable.

## 6. Rule Matrix

Verdicts: `Complied`, `Partial`, `Violated`, or `Not provable`. Rule sentence boundaries follow user text exactly.

| # | Exact rule sentence | Verdict | Evidence |
|---:|---|---|---|
| 1 | Implementation-first: Freeze the requested outcome, invariants, exclusions, and acceptance criteria. | Partial | Section 2 baseline and three explicit contract decisions were recorded. However critic/design work preceded implementation, and R2 reopened closure around evidence/process obligations absent frozen outcome. |
| 2 | Adjust the technical path only when evidence requires it. | Partial | R1 product defects and two R2 product/shared-contract defects supplied evidence for technical adjustment. Recursive DTO validation, exhaustive native-state proof, FR-1–FR-16 ledger, full screenshot regeneration, and historical TDD proof were not tied to reproduced user failure. |
| 3 | Use 10–15-minute checkpoints without interrupting atomic work. | Not provable | Telemetry proves bounded attempts plus eight exit-code-1 timeout/failure runs, but current Part A evidence lacks checkpoint timestamps needed to establish 10–15-minute cadence. Continuations preserved work, yet checkpoint system did not enforce cumulative stop. |
| 4 | Follow reproduced failures to a controllable root cause or proven external blocker. | Partial | R1 defects and R2 Rust taxonomy mismatch were reproduced/causally tied and fixed. R2 publication race remained high-confidence same-root inference. CR-MAJ-6/7/9 had no reproduced runtime failure or external blocker. |
| 5 | Check adjacent areas only when they share the same writer, reader, contract, or data path, starting with one representative case. | Violated | User explicitly selected separate Rust/browser proof plus DTO parity at `18:27:29.729Z`. R2 nevertheless expanded to recursive DTO validation, exhaustive native-state proof, and broad FR-1–FR-16 reachability rather than stopping after representative shared-path evidence. |
| 6 | Every scope expansion requires a falsifiable, evidence-backed hypothesis. | Violated | CR-MAJ-6 evidence completeness, CR-MAJ-7 screenshot provenance, and CR-MAJ-9 historical TDD evidence became Majors without reproduced runtime/user-value failure. Historical evidence demand is not a falsifiable product hypothesis. |
| 7 | Stop branches with no causal link or requiring a separate deliverable. | Violated | Screenshot regeneration/provenance, historical TDD reconstruction, and exhaustive reachability continued as blockers. Incident also produced modified `wiki/log.md` and untracked `pidex/`, outside authorized DPR-04 deliverable. |
| 8 | Stop the task once acceptance passes, the causal chain closes, and in-scope blockers are cleared. | Violated | Broad suites passed and valid product defects reached fixed HEAD `957fa9d9…`; evidence/process branches kept pipeline active until explicit user pause at `23:34:49.617Z`. |
| 9 | Run one independent review cycle; after fixes, revalidate only affected scenarios. | Violated | R1 was authorized independent review. R2 was second independent primary review. Post-R1 work broadened beyond affected scenarios into exhaustive evidence obligations. |
| 10 | External side effects require separate explicit authorization. | Violated | Current status includes ` M wiki/log.md` and `?? pidex/`. Frozen exclusions prohibited wiki/external PIDEX changes; no separate authorization event appears in accepted decisions. |

Aggregate: 0 fully complied, 3 partial, 6 violated, 1 not provable. This aggregate is descriptive, not weighted; one process violation does not negate valid product fixes.

## 7. Earliest Drift

### 7.1 Earliest demonstrable drift

**Verified:** no later than R2 publication at `2026-07-18T18:56:30.230Z`.

Why this point is demonstrable:

1. R1 already consumed authorized one-independent-review-cycle budget.
2. R1 fixes should have triggered affected-scenario-only revalidation.
3. R2 instead became second independent primary review.
4. R2 published five Majors. Three lacked reproduced runtime/user-value failure:
   - CR-MAJ-6: evidence completeness.
   - CR-MAJ-7: screenshot provenance/regeneration.
   - CR-MAJ-9: historical TDD/process evidence.
5. R2 expanded closure into recursive DTO validation, exhaustive native-state proof, FR-1–FR-16 reachability ledger, full screenshot regeneration, and historical TDD evidence.
6. These obligations exceeded user’s `18:27:29.729Z` contract: separate Rust and browser proof with Rust/TypeScript DTO parity, no fixture exporter/checked bridge.

R2 also contained two causally relevant findings. Presence of valid findings does not authorize remaining evidence/process expansion; each finding requires independent classification.

### 7.2 Earlier warning signs, not independently sufficient to prove drift

| Earlier signal | Evidence | Why warning, not chosen drift point |
|---|---|---|
| Long pre-implementation critic/design interval | Pipeline began `11:33:05Z`; preview approval occurred `15:37:10.100Z`, after two operator contract gates. | Gates resolved real semantic ambiguity. Duration alone does not prove waste. |
| Repeated contract resets | User narrowed Comparability at `12:30:29.533Z`, provenance/order at `14:52:53.417Z`, proof architecture at `18:27:29.729Z`. | Each decision was authorized. Warning lies in broad evidence machinery surviving each narrowing. |
| Four slices became seven implementer runs | Three remediation spawns beyond four planned slices. | R1 defects were valid; extra runs alone do not prove overengineering. |
| Eight exit-code-1 runs | 20.51% of 39 runs through cutoff. | Timeouts/failures reveal control-loop friction, but may occur during justified work. |
| Review-heavy lane mix | 10 critic + 8 code-review runs = 46.15% of recorded runs. | Review volume is warning only; defect yield can justify review. R2 finding anatomy supplies decisive evidence. |
| Broad suites passed before closure | Remediation continued after broad acceptance. | Could remain justified if causal blockers existed. CR-MAJ-6/7/9 show blockers had shifted to evidence/process. |
| External file changes | `wiki/log.md` modified; `pidex/` untracked. | Clear side-effect violation, but exact creation time is not established in Part A; cannot place before R2 safely. |

**Determination:** R2 publication is earliest timestamp where review-budget breach and non-causal blocker expansion are simultaneously evidenced. Earlier drift may have occurred, but exact onset cannot be moved earlier without per-run artifact timestamps or side-effect creation times.

## 8. Classification

Classes answer different questions and may overlap. `Product` means observable DPR-04 behavior. `Shared contract` means Rust/TypeScript/browser boundary or same writer/reader/data path. `Evidence` means proof artifact completeness without demonstrated product failure. `Process` means workflow/rule compliance. `Side effect` means repository/external mutation outside authorized product output.

| Item | Primary class | Secondary class | Causal tie to frozen acceptance | Status at pause |
|---|---|---|---|---|
| Paired Execution/Quality generation identity defect | Product | Shared contract | Direct: violates shared-generation invariant. | Fixed by HEAD `957fa9d9…`. |
| Raw/private data boundary defect | Product | Shared contract | Direct: violates no-path/content/provenance browser boundary. | Fixed by HEAD. |
| Invalid/future `generated_at` state defect | Product | Shared contract | Direct: violates `Unknown` recency semantics. | Fixed by HEAD. |
| Typed DTO contract defect | Shared contract | Product | Direct: native/browser parity and display-safe DTO acceptance. | Fixed by HEAD. |
| Accessibility defect | Product | — | Direct: keyboard/focus/semantic/contrast acceptance. | Fixed by HEAD. |
| Same-root publication race | Shared contract | Product | Direct if race publishes mismatched generation. Same writer/reader root. | High-confidence causal inference; fixed by HEAD. |
| Rust taxonomy mismatch | Shared contract | Product | Direct: reproduced native-state classification mismatch. | Verified and fixed by HEAD. |
| CR-MAJ-6 evidence completeness | Evidence | Process | No reproduced runtime/user-value failure. | Product non-blocker under implementation-first contract. |
| CR-MAJ-7 screenshot provenance/full regeneration | Evidence | Process | No reproduced runtime/user-value failure; preview had explicit user approval. | Separate evidence branch; product non-blocker. |
| CR-MAJ-9 historical TDD proof | Process | Evidence | Historical chronology cannot change current runtime behavior. | Separate process audit; product non-blocker. |
| Recursive DTO validation beyond representative parity case | Evidence | Process | Adjacent contract relevance exists, but exhaustive expansion lacked falsifiable failure. | Scope-expanded branch. |
| Exhaustive native-state proof | Evidence | Process | Some native proof required; exhaustive state closure exceeded selected separate-proof contract. | Scope-expanded branch. |
| FR-1–FR-16 reachability ledger | Evidence | Process | Acceptance traceability can aid review; no demonstrated missing reachable behavior supplied. | Scope-expanded branch. |
| Second independent primary review R2 | Process | — | Contradicts one-cycle rule regardless of valid findings discovered. | Completed before pause; caused new remediation. |
| Eight timeout/failure exits followed by continuation | Process | — | No direct product value; indicates local breaker without cumulative cap. | Exact through cutoff; lower bound overall. |
| Modified `wiki/log.md` | Side effect | Process | Explicitly excluded; no product acceptance tie. | Present and unauthorized at pause. |
| Untracked `pidex/` | Side effect | Process | External PIDEX changes explicitly excluded. | Present and unauthorized at pause. |

Classification result: R1 was predominantly product/shared-contract review and generated justified remediation. R2 mixed two justified product/shared-contract concerns with three non-product Majors plus broader evidence demands. Pipeline treated mixed batch as indivisible, allowing evidence/process items to inherit release-blocking authority from valid defects.

## 9. R1/R2 Anatomy

### 9.1 Review comparison

| Dimension | R1 | R2 |
|---|---|---|
| Review-cycle status | Authorized first independent review. | Unauthorized second independent primary review. |
| Finding shape | Paired-generation, privacy, invalid/future-state, typed-contract, accessibility. | Five Majors: two product/shared-contract concerns; three evidence/process concerns. |
| Reproduction/causal basis | Direct frozen-invariant ties; defects treated as valid and fixed. | Rust taxonomy mismatch reproduced. Publication race high-confidence same-root inference. CR-MAJ-6/7/9 had no reproduced runtime/user-value failure. |
| Correct next action under rule | Fix valid findings; revalidate affected scenarios. | Classify two causal findings for affected remediation; stop three separate evidence/process branches. Do not launch another full review loop. |
| Actual effect | Triggered remediation spawns and broad reruns. | Expanded closure and kept pipeline active after broad acceptance. |
| Final status | Product findings fixed by HEAD `957fa9d9…`. | Two product/shared-contract concerns fixed by HEAD; three non-product Majors remain evidence/process requests, not product blockers. |

### 9.2 R1 finding anatomy

| Finding | Evidence label | Causal anatomy | Status |
|---|---|---|---|
| Paired-generation defect | **Verified** | Execution and Quality could violate one-generation identity; same publication contract and reader. | Fixed; affected product path accepted at HEAD. |
| Privacy defect | **Verified** | Browser-bound DTO exposed or risked exposing data forbidden by frozen boundary. | Fixed. |
| Invalid/future-state defect | **Verified** | Recency reader failed required `Unknown` treatment for invalid/future timestamps. | Fixed. |
| Typed-contract defect | **Verified** | Rust/TypeScript/browser DTO expectations diverged on shared boundary. | Fixed. |
| Accessibility defect | **Verified** | Rendered Quality UI missed frozen keyboard/focus/semantic/contrast behavior. | Fixed. |

R1 root pattern: implementation defects mapped to explicit invariants and controllable product codepaths. Remediation was in scope. Report does not claim every broad rerun after each fix was necessary; only finding remediation itself was justified.

### 9.3 R2 finding anatomy

| Finding | Evidence label | Causal hypothesis / anatomy | Fastest disconfirming test | Missing telemetry for proof | Status |
|---|---|---|---|---|---|
| Same-root publication race | **High-confidence inference**; confidence High | Shared writer may publish Execution and Quality generation components non-atomically, allowing reader to observe mismatch. Same root/data path makes adjacent check allowed. | Force interleaving at publication boundary; assert no mixed generation across repeated paired reads. One observed mismatch confirms; deterministic atomic snapshot disconfirms known interleaving. | Normal: generation ID and publication transaction ID on paired read. Debug: writer step/interleaving trace. | Fixed by HEAD; original causal mechanism not fully proven from Part A evidence. |
| Rust taxonomy mismatch | **Verified** | Native classifier emitted taxonomy inconsistent with frozen recency/attribution state consumed by TypeScript/browser. Reproduced shared-contract failure. | Run focused native fixture for reproduced input and DTO parity assertion. | Normal: emitted taxonomy plus sanitized reason code. Debug: classifier branch trace. | Fixed by HEAD. |
| CR-MAJ-6 evidence completeness | **Verified as evidence gap; not verified as product defect** | Review required more exhaustive runtime DTO/native-state/FR reachability proof. No reproduced user-visible failure supplied. | Run one representative Rust→DTO→browser case selected by `18:27:29.729Z` contract. If it passes and no failing criterion exists, release-blocking product claim is disconfirmed. | Normal: acceptance criterion-to-focused-test result. Debug: full DTO serialization trace only when representative case fails. | Unresolved evidence request; non-blocking under user contract. |
| CR-MAJ-7 screenshot provenance | **Verified as evidence gap; not verified as product defect** | Review treated screenshot regeneration/provenance as closure requirement despite approved preview and no reproduced responsive/accessibility mismatch. | Compare affected 1440×900 and 390×844 scenarios only. Passing focused visual/semantic checks disconfirm product blocker. | Normal: viewport, commit, scenario, pass/fail attached to approved capture. Debug: render diff artifacts when mismatch occurs. | Separate evidence branch; non-blocking under user contract. |
| CR-MAJ-9 historical TDD evidence | **Verified as process/evidence request; not product defect** | Review demanded proof of historical test-first ordering. Historical chronology has no causal mechanism that can alter current runtime behavior. | Current focused test fails or passes independently of commit chronology; passing affected tests disconfirms runtime blocker. | Process telemetry: immutable test/implementation event timestamps would prove chronology in future. No runtime telemetry can retroactively prove it. | Separate audit concern; cannot be repaired as current product behavior. |

### 9.4 Determination

R1’s anatomy was defect-led: frozen criterion → reproduced/shared-path failure → product fix. R2’s anatomy was mixed: two causal concerns were bundled with three evidence/process demands. Batch-level `Major` severity erased this distinction. Cumulative overengineering came from treating review authority as transitive: because some R2 findings were valid, all R2 obligations remained release blockers.

## 10. Why Circuit Breaker Failed Cumulatively

Pause-only controls bounded individual attempts. They did not maintain task-level budgets or retire obligations. Result: each timeout/pause reduced immediate run length while preserving full backlog for next continuation.

### 10.1 Verified failure mechanism

| Mechanism | Evidence | Cumulative result |
|---|---|---|
| Attempt-local timeout, no task-local cap | Eight exit-code-1 timeout/failure runs among 39 by `19:37:05.655Z`; later work still reached final HEAD and `23:34:49.617Z` pause. | Failure exit became continuation trigger, not stop decision. |
| Continuation restored unresolved blocker set | Three remediation implementer spawns and four extra commits followed four planned slices. | Work budget reset per spawn; aggregate remained unbounded. |
| No enforced independent-review counter | User allowed one independent review; R1 and R2 both ran. | Second review regenerated scope after first remediation. |
| No finding-type gate | R2 bundled two causal defects with CR-MAJ-6/7/9 evidence/process items. | Non-product requests inherited Major/release-blocking status. |
| Contract reset was local, not subtractive | User narrowed semantics at `12:30`, `14:52`, and proof architecture at `18:27`. | New decisions changed implementation contract but did not delete stale broad evidence obligations. |
| Acceptance signal lacked stop authority | Broad suites passed; valid defects later fixed at `957fa9d9…`. | Review/evidence completion outranked passing product acceptance. |
| Checkpoint tracked liveness, not cumulative value | Runs were bounded, yet total reached 39 with 18 critic/review lane runs. | Frequent pauses can coexist with escalating total effort. |
| External side effects lacked authorization gate | `wiki/log.md` modified and `pidex/` untracked despite explicit exclusions. | Pause mechanism did not constrain output boundary. |
| Telemetry ended before task ended | Exact run ledger stops `19:37:05.655Z`; user pause came 3h 57m 43.962s later. | Operator lacked complete cumulative dashboard at decision time; full overrun is only lower-bounded. |

### 10.2 Accumulation sequence

1. Baseline authorized four slices and one review.
2. Critic/design stages consumed multiple bounded attempts and three user contract gates. Each gate resumed pipeline.
3. Four slices completed in four commits.
4. R1 validly opened remediation.
5. Timeout/failure exits paused individual runs. Continuations preserved remediation plus review evidence obligations.
6. Implementer count rose from expected four to seven; commits rose from four to eight.
7. R2 opened despite exhausted independent-review budget.
8. Two valid R2 concerns legitimized continued remediation, while three evidence/process Majors remained attached.
9. Passing broad suites and fixed product defects did not satisfy evidence/process blockers.
10. Only explicit user Choice A+B at `23:34:49.617Z` broke loop by changing closure authority: affected scenarios only, pipeline pause, incident report first.

### 10.3 Root cause determination

**Verified process root cause:** circuit breaker evaluated each spawn’s duration/status, not cumulative task state. No enforced invariant combined `(review cycles ≤ 1)`, `(scope expansion has falsifiable product hypothesis)`, `(acceptance passed)`, `(side effects authorized)`, and `(aggregate continuations bounded)`. Therefore pauses were resumable scheduling events, not closure decisions.

**Contributing control weakness:** blocker model lacked class separation. Product defects, shared-contract defects, evidence gaps, process-history requests, and side effects were not assigned distinct stop authority. Mixed R2 batch stayed globally blocking.

**Contributing telemetry weakness:** exact metrics ended almost four hours before final pause. Normal always-on incident control needed cumulative run count, review-cycle count, continuation count, current blocker class, acceptance state, and side-effect state at every continuation gate. Without those, operator saw local pause prompts rather than cumulative contract breach.

### 10.4 Remaining Part A gaps

- Eight exit-code-1 runs are exact in aggregate; individual attempt timestamps and timeout-versus-other-failure split remain unavailable in current report evidence.
- Only terminal commit hash is reproduced in Part A. Eight-commit count and 4+4 split are exact, but per-commit hashes/times await section 18 appendix.
- Earliest side-effect creation time remains unknown, so side-effect drift cannot be placed before R2.
- Publication race root is high-confidence inference, not fully reproduced mechanism; required disconfirming test and telemetry are in section 9.

## 11. Role of Primary vs Secondary Reviewers

### 11.1 Role split

Primary reviewer held publication authority: consolidate findings, assign severity, and return release-blocking verdict. R1 used that authority within authorized single independent cycle. R2 used same authority after review budget was exhausted. Secondary/critic lanes supplied challenge, contract analysis, and supporting observations; telemetry records 10 critic-lane runs and 8 code-review-lane runs through cutoff, but available report evidence does not identify every run as primary or secondary or expose person-level attribution.

| Role | Legitimate incident function | Observed behavior | Control failure |
|---|---|---|---|
| Primary R1 | Independent product review against frozen acceptance. | Published five causally tied product/shared-contract defect classes. | Remediation justified; broad rerun breadth not independently proven necessary. |
| Secondary/critic support around R1 | Challenge representative paths, reproduce defects, clarify contract. | Contributed within review-heavy 18-run critic/code-review volume. | Findings and supporting evidence were not recorded with separate stop authority. |
| Primary R2 | Under user rule, no second independent cycle remained; only affected-scenario revalidation was authorized. | Published five Majors, including two causal concerns and three evidence/process demands. | Review-cycle conflict was not adjudicated before publication. |
| Secondary/critic support around R2 | Test causal hypotheses on affected writer/reader/contract path. | Expanded proof expectations toward recursive DTO validation, exhaustive native states, FR-1–FR-16 reachability, screenshots, and historical TDD evidence. | Support scope became release scope despite absent reproduced product failure. |
| Operator/user | Own contract and final scope authority. | Narrowed semantics three times; finally selected Choice A+B and paused pipeline. | Earlier decisions updated local contract but did not retire inherited review obligations. |

### 11.2 Conflict and adjudication dynamics

Three conflicts required explicit adjudication but instead flowed through severity labels:

1. **Review authority conflict:** user authorized one independent cycle; pipeline launched R2. R2’s existence conflicted with controlling rule before finding merit was considered.
2. **Finding-class conflict:** two R2 concerns mapped to product/shared-contract paths; CR-MAJ-6/7/9 mapped to evidence/process. Primary publication assigned all five `Major`, flattening causal differences.
3. **Acceptance conflict:** broad suites and later affected fixes indicated product closure, while reviewers required exhaustive proof and historical evidence. No mechanism made passing acceptance authoritative over non-product review requests.

Severity therefore acted as an escalation multiplier. Once primary reviewer labeled mixed items `Major`, secondary evidence requests inherited remediation and closure authority. No independent adjudicator reclassified each item by `(reproduced failure, frozen criterion, causal path, user authorization)`. Valid R2 concerns made entire batch appear valid; unsupported items gained transitive legitimacy.

**Verified:** R1 product findings and R2 taxonomy mismatch had direct/reproduced causal support. **High-confidence inference:** R2 publication race shared writer/reader root and warranted one focused affected check. **Verified as non-product requests:** CR-MAJ-6/7/9 supplied no reproduced runtime/user-value failure in available evidence. Person-level disagreement, exact reviewer prompts, and which secondary originated each item remain unproven and are deferred to section 18 evidence appendix.

## 12. Timeout/Stall Pattern and Bounded Continuations

### 12.1 Known pattern

Telemetry through `2026-07-18T19:37:05.655Z` records 39 runs, 8 exit-code-1 timeout/failure exits, and 12,952,408 ms summed runtime. Exit-1 rate was 20.51%; mean summed runtime was about 5m 32.113s per run. Exact timeout-versus-other-failure split and individual exit times are unavailable, so report does not relabel all eight as pure timeouts.

Pattern was not one long hung process. Pattern was repeated bounded attempt → exit/pause → continuation with unresolved obligations restored. Evidence: work continued after exit-1 events, implementer count reached 7, commit count reached 8, R2 remediation continued past metrics cutoff, and final user pause occurred 3h 57m 43.962s after cutoff.

### 12.2 Volume added by continuation

| Continuation dimension | Base/authorized | Recorded outcome | Added volume |
|---|---:|---:|---:|
| Implementation spawns | 4 expected minimum | 7 | +3 spawns; 75% over minimum. |
| Product commits | 4 planned | 8 | +4 commits; 100% increase. |
| Independent reviews | 1 | 2 | +1 unauthorized cycle. |
| Failed/timed-out exits | 0 useful-output target | 8 by cutoff | 8 handoff/restart points; lower bound through pause. |
| Critic + code-review runs | No numeric user budget beyond one independent cycle | 18/39 | 46.15% of recorded runs occupied review lanes. |
| Wall time after R2 publication | Closure should follow causal fixes | 4h 38m 19.387s to user pause | Continued mixed remediation/evidence period. |

Continuations added more than rerun overhead. Each restored whole blocker set, permitting new reviewer interpretation, repeated context loading, another implementation attempt, and renewed evidence collection. Local 10–15-minute checkpoint intent could not limit aggregate cost because no continuation consumed a cumulative retry, review, or scope budget.

### 12.3 Stall diagnosis

Operational stall occurred when progress ceased to reduce release conditions. Product defects were fixed and broad suites passed, but blocker count did not collapse because evidence completeness, screenshot provenance, historical TDD proof, and exhaustive reachability remained open. Timeout exits interrupted execution without adjudicating those obligations. Result was **productive local motion with stalled global closure**.

Known metrics prove frequency and accumulation, not exact per-attempt causality. Remaining evidence gaps: eight run timestamps, exit reason split, per-continuation inherited blocker list, and post-cutoff run count/runtime. Those gaps prevent a precise retry tree but do not alter verified cumulative mechanism.

## 13. External Side-Effect Incident

### 13.1 Unauthorized mutations

Current paused state contains two changes outside DPR-04 product authorization:

- ` M wiki/log.md` — tracked wiki log modified despite explicit exclusion of wiki/roadmap/ADR edits and requirement for separate side-effect authorization.
- `?? pidex/` — untracked PIDEX content inside repository despite explicit exclusion of external PIDEX changes.

No accepted decision in section 2.4 authorizes either mutation. User approval covered DPR-04 semantics, preview, separate Rust/browser proof, and final closure mode only. Therefore both are verified process/side-effect incidents, not product deliverables.

### 13.2 Never-commit boundary

`pidex/` is control/process material and subject to PIDEX never-commit constraint. Its untracked state means it is not part of eight DPR-04 commits at `957fa9d`; it must not be staged, committed, or represented as product evidence. `wiki/log.md` is tracked but dirty; its modification likewise sits outside authorized product commits. Current dirt must stay separated from product-state judgment.

| Path | Git state at pause | Authorization | Product relevance | Incident judgment |
|---|---|---|---|---|
| `wiki/log.md` | Modified tracked file | None evidenced | None; wiki edits frozen out | Unauthorized side effect. |
| `pidex/` | Untracked directory | None evidenced; never-commit constraint applies | None; PIDEX/process output | Unauthorized side effect; never commit. |

### 13.3 Scope and evidence limits

Verified current dirt does not prove creator, creation time, or exact contents. Report cannot place side-effect onset before R2 or attribute it to primary reviewer, secondary reviewer, implementer, or harness. No content inspection was performed for this section. Product HEAD remains identifiable because both changes are outside committed `957fa9d`; repository workspace is nevertheless not clean.

Side-effect handling is a repository-boundary gate, not reason to reopen DPR-04 design or review. Any disposition requires explicit user authority and must preserve `pidex/` never-commit constraint.

## 14. Current Repository and Product State

### 14.1 Frozen repository snapshot

- Detached `HEAD`: `957fa9d9b4c4e91593ca1cb55e86b075509d0685` (`957fa9d`).
- DPR-04 commit count: 8 exact — 4 planned slice commits plus 4 remediation commits.
- Implementer runs through cutoff: 7 — 4 expected slice runs plus 3 remediation spawns.
- Workspace dirt: ` M wiki/log.md`; `?? pidex/`.
- Product branch/tag/push/publish/deploy work: excluded; none required for incident closure.

Only terminal hash and aggregate 4+4 accounting are available in current report. Per-commit IDs, subjects, and timestamps remain section 18 pending evidence; no values are invented here.

### 14.2 Product and test evidence

Broad product suites passed during remediation. HEAD contains fixes for verified R1 paired-generation, privacy, invalid/future-state, typed-contract, and accessibility defects; reproduced R2 Rust taxonomy mismatch; and high-confidence same-root publication race concern. Existing evidence states broad product acceptance had passed after valid defects were fixed.

| Area | Evidence at `957fa9d` | Blocker status |
|---|---|---|
| Requested Execution/Quality product shape | Four planned slices delivered. | No evidenced blocker. |
| Paired generation/publication | R1 defect and R2 race concern fixed. | Needs only affected generation/publication revalidation under final contract. |
| Browser privacy/display-safe DTO | Defect fixed; typed boundary fixed. | Needs only affected privacy/parity check. |
| Invalid/future recency and Rust taxonomy | Reproduced defects fixed. | Needs focused native/DTO/browser taxonomy check. |
| Accessibility/responsive behavior | R1 defect fixed; approved design exists. | Needs affected checks at 1440×900 and 390×844, not full screenshot regeneration. |
| Broad regression state | Broad suites reported passing. | No evidence supports another broad-suite cycle. |

### 14.3 Actual blockers versus evidence gaps

**Actual product blockers:** none currently evidenced at HEAD. A focused affected scenario can become blocker only if it reproduces failure against frozen acceptance or proves external blocker.

**Repository-boundary issue:** unauthorized `wiki/log.md` modification and untracked never-commit `pidex/` remain visible. They are workspace hygiene/authorization concerns, not DPR-04 runtime defects.

**Non-blocking evidence gaps:** CR-MAJ-6 exhaustive DTO/native/FR proof, CR-MAJ-7 full screenshot provenance/regeneration, CR-MAJ-9 historical TDD chronology, per-commit appendix detail, per-run timeout timestamps, side-effect origin time, and full reproduction of original publication-race mechanism. These gaps may support later audit/analysis but cannot inherit product-blocking authority without a failing affected criterion.

Current determination is bounded: product behavior is accepted by existing broad-test and fix evidence, subject only to user-approved affected-scenario confirmation. Report does not claim clean workspace, complete audit trail, or proof of every theoretically reachable state.

## 15. User-Approved Simplified Closure Contract

At `2026-07-18T23:34:49.617Z`, user selected Choice A+B: pause pipeline, complete incident report first, then use implementation-first affected-scenarios-only closure. This decision supersedes recursive review/evidence expansion for Plan 16722.

### 15.1 Retain

- Frozen outcome, invariants, exclusions, and accepted semantic decisions in section 2.
- Product implementation and valid fixes already committed through `957fa9d`.
- R1 defect fixes: paired generation, privacy, invalid/future recency, typed contract, accessibility.
- R2 causal fixes: Rust taxonomy mismatch and same-root publication concern.
- Separate Rust native-attribution proof and browser presentation proof with one representative Rust/TypeScript DTO parity case, per `18:27:29.729Z` user choice.
- Incident report as required first closure artifact.

### 15.2 Drop from product closure

- Second or further independent primary review.
- Recursive runtime DTO validation beyond representative affected parity case.
- Exhaustive native-state proof.
- FR-1–FR-16 reachability ledger as release gate.
- Full screenshot regeneration/provenance campaign.
- Historical TDD chronology reconstruction.
- M17/state/metrics, review authority, writes/actions/persistence/cache, fixture exporter/checked bridge, wiki/roadmap/ADR work, external PIDEX changes, and all other frozen exclusions.
- Any attempt to commit `pidex/`; never-commit constraint remains absolute.

### 15.3 Affected-only checks

Closure checks are limited to paths changed by valid findings:

1. Paired Execution/Quality generation identity, including focused publication interleaving/paired-read behavior.
2. Display-safe DTO/privacy boundary and one representative Rust→TypeScript→browser parity case.
3. Invalid/future `generated_at` handling and reproduced Rust taxonomy case.
4. Accessibility/responsive behavior affected by fixes at 1440×900 and 390×844.
5. Quality failure isolation from usable Execution where paired-generation remediation touched same writer/reader path.

No adjacent expansion is allowed unless one focused check fails and supplies falsifiable causal link through same writer, reader, contract, or data path. Start with one representative case. A passing affected check closes that branch.

### 15.4 Proportional remaining gates

| Gate | Required evidence | Pass effect | Expansion limit |
|---|---|---|---|
| Incident gate | Sections 1–18 complete per user-requested atomic parts. | Allows product closure activity to resume. | Report completion only; no product edits. |
| Product gate | Listed affected checks pass at `957fa9d`, or failure traced to controllable root/external blocker. | Closes DPR-04 causal chain. | Failed scenario only plus one same-path representative adjacent case. |
| Side-effect gate | Explicit user disposition for dirty `wiki/log.md` and untracked `pidex/`; `pidex/` never committed. | Separates repository hygiene from product acceptance. | No wiki/PIDEX mutation without authorization. |
| Stop gate | Acceptance passes, no reproduced in-scope blocker remains, and side-effect boundary is preserved. | Task terminates. | No new review, audit, or evidence campaign. |

### 15.5 Hard stop

After incident report completion and passing affected checks, stop Plan 16722. Do not run another independent review, broad suite, exhaustive state matrix, screenshot campaign, chronology audit, or continuation. Reopen only on a newly reproduced failure against frozen acceptance or proven external blocker. Evidence completeness alone, reviewer severity alone, historical-process gaps, and unauthorized side-effect cleanup uncertainty do not reopen product scope.

## 16. PIDEX Developer Recommendations

**Advisory boundary:** External PIDEX developer and PIDEX orchestration/runtime controls only. No `pidex-ui` product, wiki, log, repository, or project-config change authorized.

### 16.1 Immutable acceptance baseline plus user-delta ledger

- **Observed incident problem/evidence:** Three authorized contract resets narrowed work, but stale evidence obligations survived and R2 reopened exhaustive DTO/state/screenshot/TDD closure.
- **Causal mechanism:** Mutable context merged old expectations with current user authority; no distinction between baseline, authorized delta, and superseded obligation.
- **Minimal implementation:** Persist content-addressed baseline containing outcome, invariants, exclusions, criteria, review budget, and side-effect policy. Append immutable user deltas with timestamp, authority, exact add/change/remove operation, and superseded IDs. Build briefs from baseline plus ordered deltas.
- **Falsifiable acceptance test:** Remove fixture obligation `O1` by user delta and retain `O2`. Later reviewer brief must show baseline hash, delta, tombstoned `O1`, active `O2`; returning `O1` as blocker without new user delta fails.
- **Risk:** Bad delta can freeze ambiguity or remove valid criterion; ledger adds prompt weight.
- **Explicit non-goals:** No automatic intent interpretation, retroactive Plan 16722 reconstruction, product-spec authoring, or prevention of explicit user scope changes.

### 16.2 Finding-class taxonomy

- **Observed incident problem/evidence:** R2 bundled two causal product/shared-contract findings with three evidence/process demands; shared `Major` label made all release blockers.
- **Causal mechanism:** Severity encoded urgency, not finding kind or causal tie. Evidence gaps inherited blocker authority from valid defects.
- **Minimal implementation:** Require primary class `Product`, `SharedContract`, `Evidence`, `Process`, or `SideEffect`; optional secondary class. Record criterion ID, reproduction state, causal path, and blocking scope. Only reproduced Product/SharedContract failures or proven external blockers block product acceptance. Evidence/Process remain advisory unless user promotes them; SideEffect gates only affected boundary.
- **Falsifiable acceptance test:** Synthetic batch contains reproduced taxonomy mismatch and missing historical TDD proof. First must block affected scenario; second must route separately and not block product. Batch severity making both blockers fails.
- **Risk:** Misclassification may understate defect; schema adds review work.
- **Explicit non-goals:** No suppression of evidence/process findings, severity removal, side-effect dismissal, or automatic fixing.

### 16.3 One independent-review budget plus affected-only revalidation mode

- **Observed incident problem/evidence:** User authorized one review. R1 consumed it; R2 still launched. Four expected implementer runs became seven; four commits became eight.
- **Causal mechanism:** Review was ordinary stage, not task-level scarce budget. Remediation returned to full review rather than changed-scenario checks.
- **Minimal implementation:** Persist and atomically decrement `independent_review_budget` at launch. After first review transition to `AFFECTED_REVALIDATION`; derive scenario set from accepted findings and changed paths/contracts. Reject another independent review unless explicit user delta replenishes budget.
- **Falsifiable acceptance test:** With budget `1`, run R1, remediate two findings, request R2. No independent reviewer may start; only two affected checks run. Explicit user increment must permit exactly one later review.
- **Risk:** First review may miss defects; affected mapping may miss indirect impact.
- **Explicit non-goals:** No defect-free guarantee, ban on focused verification, hidden reset after timeout/handoff, or default broad regression campaign.

### 16.4 Falsifiable scope-expansion hypothesis gate

- **Observed incident problem/evidence:** Recursive DTO validation, exhaustive native states, FR-1–FR-16 ledger, screenshots, and historical TDD expanded closure without reproduced runtime failure.
- **Causal mechanism:** Concern or theoretical possibility created work without disconfirmable claim tied to frozen acceptance and shared path.
- **Minimal implementation:** Require affected criterion, observed evidence, causal mechanism, same writer/reader/contract/data-path link, smallest disconfirming test, bounded files/scenarios, and stop result before adjacent work. Reject missing fields and non-falsifiable historical/completeness claims.
- **Falsifiable acceptance test:** “Validate every DTO for completeness” must be rejected. “Publication interleaving can mix generation IDs; run one forced-interleaving paired-read test” may authorize one check and must close when disconfirmed.
- **Risk:** Gate may delay sparse-evidence exploration; agents may manufacture weak hypotheses.
- **Explicit non-goals:** No ban on separately authorized exploration, proof that accepted hypothesis is true, separate-deliverable authority, or exhaustive expansion after pass.

### 16.5 Cumulative work/time-budget circuit breaker

- **Observed incident problem/evidence:** Attempt-local controls still allowed 39 runs, eight exit-1 runs, seven implementer runs, 18 critic/review runs, and at least 12h 1m 44.617s wall time to pause.
- **Causal mechanism:** Timeout bounded one spawn; aggregate run, continuation, review, agent-runtime, and wall-clock use had no shared stop authority.
- **Minimal implementation:** Task-level ledger tracks wall time, summed runtime, total/implementer runs, reviews, continuations, and consecutive no-progress attempts. Reserve budget atomically before spawn. Warning threshold forces checkpoint; hard threshold denies spawn and routes user gate with spent/remaining values and unresolved classes.
- **Falsifiable acceptance test:** Set hard limit five runs or 30 minutes. Sixth run after four runs and one timeout must be denied with `BUDGET_GATE`; restart must not reset counters; only recorded user grant permits continuation.
- **Risk:** Fixed budgets may stop valuable work; parallel summed runtime may overstate cost.
- **Explicit non-goals:** No universal limits, equation of runtime with value, rollback of atomic work, or silent auto-extension.

### 16.6 Ten-to-fifteen-minute atomic checkpoint semantics

- **Observed incident problem/evidence:** Required checkpoint cadence is unprovable; exits bounded attempts but did not control cumulative value.
- **Causal mechanism:** Checkpoint, timeout, heartbeat, handoff, and stop were conflated, causing interruption or automatic resume.
- **Minimal implementation:** Checkpoint due every 10–15 minutes means state emission, not cancellation. Record atomic unit, baseline/delta hash, completed evidence, blocker delta, budget spent, and next action. During indivisible work emit deferred heartbeat, then checkpoint at safe boundary. Resume only from durable checkpoint.
- **Falsifiable acceptance test:** Simulated 18-minute indivisible operation must emit heartbeat, avoid minute-15 cancellation, persist one boundary result, and resume without duplicate execution.
- **Risk:** Agents may misuse “atomic”; persistence adds overhead.
- **Explicit non-goals:** No 15-minute maximum atomic unit, automatic continuation approval, cumulative-breaker replacement, or partial product commit requirement.

### 16.7 Representative-first shared-contract checks

- **Observed incident problem/evidence:** User selected separate Rust/browser proof plus DTO parity; R2 expanded toward recursive validation and exhaustive native-state proof.
- **Causal mechanism:** Shared-contract relevance authorized every adjacent state instead of one discriminating case followed by evidence-triggered expansion.
- **Minimal implementation:** Select one representative case maximizing boundary coverage. Execute producer assertion, serialized DTO parity, and consumer assertion. Expand by one adjacent case only when representative fails and accepted hypothesis predicts shared cause.
- **Falsifiable acceptance test:** With 20 DTO variants and one reported taxonomy mismatch, initial run executes one end-to-end case. Pass closes branch; injected shared serializer failure permits exactly one predicted adjacent case.
- **Risk:** Representative selection may miss variant-specific defects.
- **Explicit non-goals:** No exhaustive matrix, fixture exporter/checked bridge mandate, replacement of frozen examples, or broad rerun after pass.

### 16.8 Terminal stop rule

- **Observed incident problem/evidence:** Broad suites passed and valid defects were fixed at `957fa9d`, yet evidence/process branches continued until user pause.
- **Causal mechanism:** Acceptance was informational while any reviewer item retained continuation authority; no terminal transition refused new work.
- **Minimal implementation:** After affected revalidation evaluate: frozen acceptance passed; no reproduced in-scope Product/SharedContract blocker; external blockers resolved/routed; protected-path boundary preserved or separately gated. On true emit `ACCEPTED_STOP` and deny spawns. Reopen only through explicit user delta naming new reproduced failure or external blocker.
- **Falsifiable acceptance test:** Passing affected checks plus open evidence/history advisories must produce terminal stop and reject reviewer/implementer launches. Explicit user reopen delta with reproduced failure permits one bounded branch.
- **Risk:** Incorrect acceptance state can stop early; reopen friction can delay urgent correction.
- **Explicit non-goals:** No claim advisories are resolved, unauthorized cleanup, prevention of user reopen, or ordinary post-stop review.

### 16.9 No historic TDD backfill blocker

- **Observed incident problem/evidence:** CR-MAJ-9 demanded historical TDD proof after implementation. Commit chronology cannot change current runtime behavior or be recreated truthfully.
- **Causal mechanism:** Process compliance and product acceptance shared one blocker channel; missing historical telemetry appeared remediable as product work.
- **Minimal implementation:** Treat test-first chronology as prospective process telemetry. Absent immutable history becomes `NOT_PROVABLE_HISTORICALLY`, routed to process audit and excluded from product blocking. Only current failing criterion/test may block.
- **Falsifiable acceptance test:** Passing affected tests with no test-first events must pass product gate, record process advisory, and emit no rewrite/backfill request. Injected current acceptance failure must block independently.
- **Risk:** Separate compliance governance may still require its own gate; process weakness may recur without future telemetry.
- **Explicit non-goals:** No fabricated/backdated evidence, history rewrite, waiver of current tests, or claim of historical TDD compliance.

### 16.10 Protected-path technical enforcement for wiki/log

- **Observed incident problem/evidence:** `wiki/log.md` changed despite explicit exclusion and no separate authorization.
- **Causal mechanism:** Agents retained filesystem write capability; prompt policy had no path-level enforcement or scoped capability.
- **Minimal implementation:** PIDEX write broker canonicalizes paths and default-denies repository `wiki/**`, log, roadmap/ADR, and caller-declared protected paths. Allow only exact-path, operation-scoped, expiring user capability recorded in delta ledger. Validate before write and verify after tool result.
- **Falsifiable acceptance test:** Unauthorized `wiki/log.md` write must be rejected before mutation and preserve hash. Exact one-write capability for fixture path must permit only that operation and reject reuse, alias, or sibling path.
- **Risk:** Bad patterns can block legitimate docs or miss symlink/path aliases; capabilities add friction.
- **Explicit non-goals:** No current `wiki/log.md` cleanup/revert, ban on authorized docs, product-gate dependency, or prompt-only enforcement.

### 16.11 Primary/secondary severity and adjudication

- **Observed incident problem/evidence:** Ten critic and eight code-review runs fed mixed findings. Primary R2 labeled all five `Major`; secondary support scope acquired release authority without item adjudication.
- **Causal mechanism:** Origin, severity proposal, final severity, class, and blocker authority were collapsed. Batch publication hid exhausted review budget and causal differences.
- **Minimal implementation:** Secondary reviewers emit evidence and proposed class/severity only; no blocker status. Single budgeted primary consolidates each item. Adjudicator checks baseline/deltas, taxonomy, reproduction, causal path, and review budget before blocker authority. Contract conflict routes to user; batch verdict cannot override item result.
- **Falsifiable acceptance test:** Secondary submits Major historical-evidence concern and reproduced taxonomy defect. First must become non-blocking Process; second may block affected scenario; indivisible Major batch publication must fail.
- **Risk:** Adjudication can bottleneck; primary bias remains; conflicts may increase user gates.
- **Explicit non-goals:** No silencing secondary reviewers, person-level blame, second independent review, or truth-by-primary-label.

### 16.12 Runtime artifacts never commit

- **Observed incident problem/evidence:** Repository contained untracked `pidex/` despite explicit exclusion and never-commit constraint.
- **Causal mechanism:** Runtime state could resolve under project root; staging/commit path had no PIDEX-owned artifact denylist. Untracked status avoided commit by circumstance, not control.
- **Minimal implementation:** Resolve PIDEX runs/state/metrics/temp artifacts to external PIDEX state root. Mark artifact roots with runtime manifest. PIDEX staging/commit broker canonicalizes paths and refuses any runtime-manifest path or known repository-local PIDEX runtime directory, including `pidex/`.
- **Falsifiable acceptance test:** Force runtime configuration toward project root and create fixture `pidex/state.json`. Runtime must redirect or abort; staging must fail; commit tree must exclude artifact. Rename/symlink must remain denied.
- **Risk:** False positives may block intentionally versioned configuration; cross-platform canonicalization is sensitive.
- **Explicit non-goals:** No deletion of current `pidex/`, blanket Git hook for non-PIDEX commits, ban on designated versioned config outside runtime manifest, or artifact commit as evidence.

### 16.13 Timeout continuation budget

- **Observed incident problem/evidence:** Eight exit-code-1 timeout/failure runs were followed by more work; exits did not retire objectives or reduce continuation authority.
- **Causal mechanism:** Timeout handler treated failure as scheduler resume, recreated backlog, and tracked neither objective retry count nor new evidence.
- **Minimal implementation:** Per-atomic-objective ledger records attempts, exit reason, durable checkpoint, new evidence, and retry budget. Timeout permits only configured bounded continuation from checkpoint; request names unfinished unit and completion evidence. Exhaustion, or two attempts without new evidence, routes gate and forbids auto-respawn. Charge all attempts to cumulative breaker.
- **Falsifiable acceptance test:** Configure one continuation. First timeout after checkpoint permits one resume. Second timeout without new evidence must emit `CONTINUATION_EXHAUSTED` and no third spawn. Successful resume closes objective and discards unused retry.
- **Risk:** Transient infrastructure failures may consume budget; progress detection may block useful retry.
- **Explicit non-goals:** No assumption every exit-1 is timeout, unlimited retry after provider/role change, handoff reset, or replacement of global breaker.

### 16.14 Control dependency and scope

External PIDEX implementation order: baseline/delta ledger; taxonomy and adjudication; review/scope/representative/terminal gates; cumulative and continuation budgets plus checkpoints; protected-path and runtime-artifact enforcement. Budgets need stable contract; terminal stop needs classified blockers; write barriers remain independent defense. Acceptance tests belong in PIDEX harness/state-machine suite, never `pidex-ui` product suite.

## 17. Proposed Incident Metrics and Regression Tests

Metrics and tests belong to external PIDEX runtime/harness. They must not create `pidex-ui` product tests, modify project config, or inspect product state beyond synthetic fixtures. Contract below measures control decisions, not agent productivity or defect count.

### 17.1 Incident metric event schema

Every control event carries `pipeline_id`, plan ID, event ID, UTC timestamp, emitter role, and schema version in addition to fields below. Event log is append-only. Missing values remain explicit `null`/`not_tested`; consumers must not infer reproduction, authorization, or causal link from severity or event order.

| Field | Required meaning and value domain | Authoritative source / owner |
|---|---|---|
| `acceptance_baseline_id` | Content-addressed ID of frozen outcome, invariants, exclusions, criteria, review budget, and side-effect policy used for decision. Immutable after freeze. | Baseline ledger / contract owner. |
| `delta_id` | Exact user-authorized delta applied to baseline; ordered, append-only, nullable only when no delta exists. Superseded obligations retain tombstones. | User-delta ledger / operator gate. |
| `finding_class` | Primary enum: `Product`, `SharedContract`, `Evidence`, `Process`, `SideEffect`; optional secondary class recorded separately. | Finding adjudicator; reviewer may only propose. |
| `hypothesis` | Structured falsifiable claim: affected criterion, observation, causal mechanism, shared-path link, smallest disconfirming test, bounded scenarios, predicted result. Required before scope expansion. | Scope-gate event / requesting role. |
| `reproduced_failure` | Tri-state `true`, `false`, `not_tested`; includes focused scenario ID and evidence reference when tested. Never derived from severity. | Validation runner / harness result. |
| `causal_path` | Ordered writer, contract, reader, and affected-criterion IDs; `external:<blocker-id>` for proven external blocker; null for advisory evidence/process item. | Adjudicator from traced evidence. |
| `review_cycle` | Monotonic independent-review ordinal. Launch reserves cycle atomically; affected revalidation does not increment it. | Review-budget ledger / scheduler. |
| `validation_mode` | Enum: `independent_review`, `affected_revalidation`, `representative_check`, `scope_disconfirmation`, `process_audit`. | Scheduler at batch reservation. |
| `affected_scenarios` | Stable scenario IDs changed by accepted finding or authorized delta. Empty list is valid; wildcard is invalid. | Finding-to-scenario mapper, confirmed by adjudicator. |
| `work_batch` | Durable batch ID linking reservation, attempts, checkpoints, results, and stop event. Retry keeps same batch and increments attempt. | Task scheduler. |
| `duration` | Monotonic elapsed runtime for one attempt/event span in ms; excludes queue/user wait and never substitutes for wall time. | Worker runtime envelope. |
| `cumulative_runtime` | Task-total summed agent runtime in ms through event, including parallel overlap and failed attempts; never reset by retry, handoff, or provider change. | Task budget ledger. |
| `checkpoint` | Object with atomic-unit ID, state `safe` or `deferred`, completed evidence IDs, blocker delta, budget spent, durable resume token, and next action. | Worker emits; checkpoint store validates durability. |
| `scope_delta` | Exact added/removed criterion, path, and scenario IDs plus authorizing `delta_id` or accepted hypothesis ID. Empty expansion has no implied authority. | Scope ledger / gate. |
| `side_effect_path` | Canonical resolved target path and operation; aliases/symlinks resolve before decision. Null when event has no external write. | Write/staging broker. |
| `authorization` | Exact-path, operation-scoped, expiring capability ID and issuer; `none` when absent. Prompt text is not authorization. | Capability ledger / user gate. |
| `stop_reason` | Enum including `accepted_stop`, `review_budget_exhausted`, `hypothesis_rejected`, `budget_gate`, `continuation_exhausted`, `side_effect_denied`, `external_blocker`, `user_pause`; required on terminal or denied transition. | State-machine transition owner. |

Minimum incident views derive only from those events: review cycles consumed versus baseline budget; scope additions lacking accepted hypothesis; reproduced Product/SharedContract blockers by causal path; Evidence/Process advisories incorrectly marked blocking; run/continuation/runtime spend by `work_batch`; elapsed checkpoint gaps and deferred atomic work; protected-path denials and grants; terminal-stop denials; baseline/delta drift. Parallel `cumulative_runtime` stays summed runtime and must display alongside wall elapsed time, never as labor or wall duration.

### 17.2 Event and source ownership

| Event | Emitting owner | System of record | Required control effect |
|---|---|---|---|
| `ACCEPTANCE_BASELINE_FROZEN` | Contract owner | Baseline ledger | Create immutable `acceptance_baseline_id`; later mutation rejected. |
| `USER_DELTA_RECORDED` | Operator/user gate | Delta ledger | Append `delta_id`; add/remove/supersede exact obligations. |
| `FINDING_SUBMITTED` | Primary or secondary reviewer | Finding inbox | Record proposed class/severity and evidence; grant no blocker authority. |
| `FINDING_ADJUDICATED` | Budgeted primary/adjudicator | Finding ledger | Set final class, reproduction, causal path, affected scenarios, blocking boundary. |
| `REVIEW_RESERVED` / `REVIEW_REJECTED` | Scheduler | Review-budget ledger | Atomically consume one cycle or deny launch without agent spawn. |
| `SCOPE_EXPANSION_ACCEPTED` / `SCOPE_EXPANSION_REJECTED` | Scope gate | Scope ledger | Apply bounded `scope_delta` or terminate proposed branch. |
| `WORK_BATCH_RESERVED` / `WORK_BATCH_FINISHED` | Scheduler | Task budget ledger | Reserve cumulative budget; charge every attempt and result to one batch. |
| `CHECKPOINT_HEARTBEAT` / `ATOMIC_CHECKPOINT` | Worker | Durable checkpoint store | Show liveness during atomic work; resume only from validated safe checkpoint. |
| `VALIDATION_RESULT` | Test harness | Evidence store | Record scenario-level result, mode, duration, reproduction state, evidence hash. |
| `BUDGET_GATE` / `CONTINUATION_EXHAUSTED` | Task budget ledger | State-machine journal | Deny next spawn; route spent/remaining budget and unresolved classes to user gate. |
| `SIDE_EFFECT_AUTHORIZED` / `SIDE_EFFECT_DENIED` | Capability/write broker | Capability plus side-effect ledger | Permit exact authorized operation once or block before mutation/staging. |
| `PROCESS_ADVISORY_RECORDED` | Adjudicator | Process-audit ledger | Preserve Evidence/Process concern without changing product acceptance. |
| `ACCEPTED_STOP` / `REOPEN_AUTHORIZED` | State-machine owner | Terminal journal | Deny all later spawns until explicit user delta names reproduced failure or external blocker. |

Ownership invariant: emitter records observed fact; adjudicator assigns blocker class; scheduler owns launch; broker owns mutation; state machine owns terminality. Reviewer severity, test runner result, or worker checkpoint cannot independently authorize another batch.

### 17.3 PIDEX harness regression scenarios

Each test uses isolated synthetic task state, fake clock, deterministic IDs, in-memory event journal, and deny-by-default filesystem/staging broker. Tests assert event payload and absence of forbidden events/spawns, not prompt prose.

| Scenario | Setup | Expected event / route | Pass criterion |
|---|---|---|---|
| Immutable baseline | Freeze baseline `B1` containing obligations `O1`,`O2`; attempt in-place mutation removing `O1`; then append authorized delta `D1` removing it. | Mutation emits `BASELINE_MUTATION_REJECTED`; `USER_DELTA_RECORDED(D1)` produces effective contract `B1+D1`. Route remains scheduler with `O1` tombstoned. | `B1` hash/content unchanged; every later event references `B1` and applicable `D1`; no brief revives `O1`. |
| Second review rejection | Baseline review budget `1`; reserve and finish R1; submit R2 request after two fixes. | `REVIEW_REJECTED` with `stop_reason=review_budget_exhausted`; route to `affected_revalidation` for two mapped scenarios, not reviewer spawn. | `review_cycle` remains `1`; no R2 agent/run event exists; only mapped scenarios execute. |
| Scope expansion without hypothesis | Active affected check passes; reviewer requests all DTO variants with no falsifiable hypothesis or causal path. | `SCOPE_EXPANSION_REJECTED` with `stop_reason=hypothesis_rejected`; route branch to stop/advisory. | `scope_delta` adds nothing; no validation batch or file scope is created. |
| Cumulative budget survives retries | Hard cap five runs or 30 summed minutes; four completed attempts plus one timed-out attempt consume cap; request continuation under new role/provider. | `BUDGET_GATE` reports spent/remaining totals and denies reservation; route user gate. | No sixth spawn; `cumulative_runtime` and attempt count remain unchanged by handoff/restart; only explicit user delta can raise cap. |
| Representative-first contract check | Twenty DTO variants; accepted hypothesis names one taxonomy path and one representative Rust→DTO→browser scenario. | First `VALIDATION_RESULT` uses `validation_mode=representative_check`. Pass routes branch closed; injected shared serializer failure allows one predicted adjacent scenario through accepted scope delta. | Passing representative case runs exactly one scenario. Failure runs only one hypothesis-predicted adjacent case; never all 20. |
| Atomic checkpoint | Simulate indivisible 18-minute operation with checkpoint due at minute 15, then worker interruption after safe boundary. | Minute 15 emits `CHECKPOINT_HEARTBEAT(state=deferred)` without cancellation; boundary emits durable `ATOMIC_CHECKPOINT(state=safe)`; retry routes to resume token. | Atomic operation executes once, durable result persists, retry resumes after boundary, and no duplicate side effect or partial commit occurs. |
| Terminal stop | Frozen acceptance and all affected checks pass; no reproduced Product/SharedContract blocker; one Evidence advisory remains. | `ACCEPTED_STOP(stop_reason=accepted_stop)`; later reviewer/worker requests are denied. Route terminal unless explicit `REOPEN_AUTHORIZED` user delta appears. | Zero post-stop spawns; advisory remains recorded non-blocking; malformed or advisory-only reopen is rejected. |
| Historical TDD evidence | Current affected tests pass; immutable test-first chronology events are absent; reviewer marks missing history `Major`. | `PROCESS_ADVISORY_RECORDED` with `finding_class=Process`, `reproduced_failure=false`; route process audit while product route proceeds to stop. | No product blocker, backfill, history rewrite, implementation batch, or fabricated event is created. |
| Protected wiki path | No capability; worker requests write to `wiki/log.md`, then retries through relative alias/symlink. | `SIDE_EFFECT_DENIED(side_effect_path=<canonical wiki/log.md>, authorization=none, stop_reason=side_effect_denied)`; route user authorization gate. | Broker rejects before mutation; file hash unchanged; alias and symlink attempts receive same denial. |
| Runtime artifact staging | Runtime root is misconfigured under project as `pidex/state.json`; staging includes direct, renamed, and symlinked forms. | Runtime emits redirect/abort event; staging emits `SIDE_EFFECT_DENIED` for runtime-manifest path and routes caller/runtime owner, never commit. | No runtime artifact enters Git index or commit tree; canonicalized aliases remain denied; designated non-runtime versioned fixture remains unaffected. |
| Primary/secondary severity | Secondary submits `Major` historical-evidence concern and reproduced taxonomy mismatch in one batch. Review budget allows one primary adjudication. | Two `FINDING_ADJUDICATED` events: Process advisory routes audit; SharedContract failure routes affected remediation. Batch-level blocker event is rejected. | Secondary severity grants no authority; final classes, causal paths, and routes differ per item; only reproduced taxonomy scenario blocks product. |

### 17.4 Coverage boundary and failure diagnostics

Harness must assert negative space: no unexpected spawn, scenario, path mutation, review-cycle increment, counter reset, blocker promotion, or post-terminal event. Each failed regression prints baseline/delta IDs, event sequence, work batch, affected scenarios, budget before/after, canonical side-effect path, authorization decision, and terminal state. Debug-only traces may include scheduler reservation race, publication order, path canonicalization, and checkpoint resume internals; normal events remain bounded schema above.

These tests validate PIDEX controls proposed in section 16. They do not re-run DPR-04 acceptance, prove Plan 16722 historical chronology, clean current workspace, assign person-level fault, or authorize changes to `pidex-ui`, wiki, or repository config.

## 18. Artifact, Commit, Event Appendix and Glossary

### 18.1 Artifact map

`*16722*` denotes plan-scoped artifact family. Exact conclusions use event ledger, operator timestamps, Git, and published review facts reproduced in sections 1–17.

| Group | Artifact location / identity | Incident use |
|---|---|---|
| Context | `agents.output/context/*16722*`; sections 2–3 | Frozen outcome, invariants, exclusions, acceptance, one-review and side-effect rules. |
| Analysis | `agents.output/analysis/16722-overengineering-incident-report-for-pidex-dev.md` | Final chronology, accounting, RCA, controls, metrics, limitations, handoff. |
| Architecture | `agents.output/architecture/*16722*` | Native attribution, DTO boundary, paired publication, shared selector, Quality path. User deltas control on conflict. |
| Planning | `agents.output/planning/*16722*` | Four slices and one-review closure baseline used for realized-work comparison. |
| Critic | `agents.output/critic/*16722*` | Semantic challenges and review support. Ledger records 10 critic-lane runs; person/artifact mapping unavailable. |
| Design | `agents.output/design/*16722*`; `http://127.0.0.1:4173/16722-dpr04-quality-intelligence-preview.html` | Approved Quality direction. URL records approval target, not current server availability. |
| Implementation | Eight commits below; `agents.output/implementation/*16722*` | Four planned slices plus four remediation checkpoints. Git tree controls product state. |
| Review | `agents.output/review/*16722*`; R1; R2 published `2026-07-18T18:56:30.230Z` | Defect evidence and mixed R2 batch. Severity alone is not acceptance authority. |
| Events | Pipeline `pidex-ui-16722-20260718T113305Z`; `C:/Users/Daniel/pidex/state/metrics/C-Users-Daniel-projects-pidex-ui/plan-16722.jsonl`; associated pipeline/operator JSONL | Run totals, decisions, pipeline identity, wall bounds, pause. Associated JSONL filenames unavailable in report evidence. |
| Repository | Detached HEAD `957fa9d9b4c4e91593ca1cb55e86b075509d0685`; ` M wiki/log.md`; `?? pidex/` | Final committed checkpoint and current unauthorized dirt outside product commits. |

### 18.2 DPR-04 commits

Purpose means incident-accounting role, not verbatim Git subject. Sequence and 4+4 split are exact.

| # | Commit | Class | Purpose |
|---:|---|---|---|
| 1 | `0cac260` | Planned 1 | Native Quality discovery/attribution and display-safe data foundation. |
| 2 | `73e1cca` | Planned 2 | Paired Execution/Quality generation and typed bridge path; failure isolation. |
| 3 | `844b6a0` | Planned 3 | Quality Overview/History, shared scope, recency, unmatched/ambiguous presentation. |
| 4 | `1386598` | Planned 4 | Responsive/accessibility behavior and planned acceptance coverage. |
| 5 | `c2edeeb` | Remediation 1 | Start R1 fixes: generation, privacy, invalid/future state, typed contract, accessibility. |
| 6 | `2573aa8` | Remediation 2 | Complete/follow up R1 shared-contract fixes and selected Rust/browser parity. |
| 7 | `28e8429` | Remediation 3 | Address causally relevant R2 publication/taxonomy paths. |
| 8 | `957fa9d` | Remediation 4 | Final affected corrections and accepted product checkpoint; full hash above. |

### 18.3 Decisions, events, pipeline, workspace

| UTC time / phase | Exact known fact |
|---|---|
| Pre-start | Report-only DPR-04; M17/state/metrics and review authority deferred. |
| `2026-07-18T11:33:05Z` | Pipeline `pidex-ui-16722-20260718T113305Z` started. |
| `2026-07-18T12:30:29.533Z` | Choice A: Comparability unavailable; unconnected observations plus semantic table; report-recency terminology. |
| `2026-07-18T14:52:53.417Z` | Choice A: discard raw Comparability; equal-time group unordered; no provenance token/order promise. |
| `2026-07-18T15:37:10.100Z` | User approved preview URL listed above. |
| `2026-07-18T18:27:29.729Z` | Choice A: separate Rust native-attribution and browser-presentation proof with Rust/TypeScript DTO parity; no fixture exporter/checked bridge. |
| `2026-07-18T18:56:30.230Z` | R2 published five Majors after R1; earliest demonstrable drift. |
| `2026-07-18T19:37:05.655Z` | Metrics cutoff; run totals exact only through this point. |
| `2026-07-18T23:34:49.617Z` | Choice A+B: implementation-first affected-only closure; pause pipeline; incident report first. |
| Current | Detached `957fa9d`; ` M wiki/log.md`; `?? pidex/`. `pidex/` remains never-commit. |

No timestamp is claimed for commits, individual exit-1 events, or dirty-path creation; evidence does not expose those values.

### 18.4 Metrics and lower-bound limits

| Measure | Known | Limitation |
|---|---:|---|
| Runs | 39 to cutoff | Lower bound through pause; post-cutoff runs unavailable. |
| Exit-1 timeout/failure | 8/39; 20.51% | Aggregate exact; timestamps absent; not every exit-1 proven timeout. |
| Implementer | 7/39; 17.95% | Exact to cutoff; four expected plus three remediation spawns. |
| Critic | 10/39; 25.64% | No person/artifact/value attribution. |
| Code review | 8/39; 20.51% | Lane runs do not equal independent cycles; primary cycles were R1/R2. |
| Other | 14/39 | Derived assuming summarized buckets disjoint. |
| Summed runtime | 12,952,408 ms; 3h 35m 52.408s | Lower bound; parallel overlap means neither wall time nor labor. |
| Start→cutoff wall | 8h 0m 0.655s | Elapsed, not summed work; start precision one second. |
| Start→pause wall | ≥12h 1m 44.617s | Lower bound from encoded start precision. |
| R2→pause | 4h 38m 19.387s | Duration alone does not classify all work as waste. |
| Cutoff→pause | 3h 57m 43.962s | Run/runtime detail unavailable. |
| Commits | 8 exact; 4+4 | Purposes above are roles, not subjects or exhaustive diffs. |
| Acceptance | Broad suites reported passing; fixes at HEAD | No rerun here; no exhaustive reachable-state claim. |
| Race | High-confidence same-root inference | Original mechanism not reproduced; forced-interleaving trace needed. |
| Side effects | Two dirty paths above | Creator, contents, and creation times unknown. |
| Reddit fetch | No successful fetch artifact in report evidence | Reddit availability/completeness/corroboration unverified; no Reddit-derived factual claim. |

Counts are not converted to cost, productivity, or blame. Concurrency, queue time, user wait, post-cutoff detail, and per-run attribution are missing.

### 18.5 Glossary

| Term | Report meaning |
|---|---|
| Acceptance baseline | Frozen outcome, invariants, exclusions, criteria, review budget, side-effect policy. |
| Acceptance delta | Exact timestamped user-authorized add/change/remove/supersession; reviewer preference is not delta. |
| Product-runtime | Observable native/UI behavior directly testable against acceptance. |
| Shared-contract | Producer/consumer boundary: Rust/TypeScript DTO, writer/reader, serialization, generation identity, taxonomy. |
| Evidence | Proof-completeness concern without demonstrated runtime failure by itself. |
| Process | Workflow concern: review count, TDD history, checkpoint, scope authority, stop behavior; not automatic product blocker. |
| External-side-effect | Mutation outside authorized output/protected boundary; requires separate explicit authorization. |
| Independent review | Fresh primary review cycle adjudicating implementation against baseline. R1 consumed authorized cycle; R2 was second. |
| Affected-only revalidation | Focused rerun of scenarios changed by valid findings on same writer/reader/contract/data path; not broad review. |
| Atomic checkpoint | Durable safe-boundary state with completed evidence, blocker delta, budget, resume point; heartbeat does not interrupt indivisible work. |
| Causal hypothesis | Falsifiable evidence-to-criterion claim with shared path, smallest disconfirming test, bounded expansion. |
| Hard stop | Terminal transition after acceptance and causal closure; denies new spawns absent authorized reopen for reproduced failure/external blocker. |

## Report Limitations and Handoff

Status `Complete` means requested report and appendix complete, not that unavailable history became fact or workspace is clean.

Remaining limits: individual exit timestamps/reasons; post-cutoff runs/runtime; person-level attribution; verbatim commit subjects/times and exhaustive diffs; side-effect origin/content/time; reproduced publication-race mechanism; Reddit corroboration. These do not change verified report determinations.

Handoff: user owns next gate. Final contract permits only section 15 affected-scenario checks after report acceptance and explicit disposition of `wiki/log.md` plus never-commit `pidex/`. Report authorizes no product edit, new independent review, broad rerun, evidence campaign, wiki mutation, PIDEX commit, or cleanup.

<!-- ROUTING
verdict: COMPLETE
route_to: user
context_file: agents.output/analysis/16722-overengineering-incident-report-for-pidex-dev.md
remaining_gaps:
  - Individual exit reasons/times, post-cutoff detail, person attribution, side-effect origin, and reproduced race mechanism unavailable.
  - Reddit fetch/corroboration unavailable; no Reddit-derived claim included.
reason: full report complete
-->
