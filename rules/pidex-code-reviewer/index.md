# pidex-code-reviewer Rules Index

Last updated: 2026-05-18 (PROC-104-D)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Structural Code Search Default | [../shared/structural-code-search.md](../shared/structural-code-search.md) | PROC-AST-GREP-1 | Prefer ast-grep for structural code searches; use rg for literal text and document the chosen search evidence |
| Hotfix Lane Runtime-Unchanged Proof | [hotfix-lane-runtime-unchanged-proof.md](hotfix-lane-runtime-unchanged-proof.md) | 3 | Post-QA narrow-diff hotfix approval requires runtime-unchanged proof + targeted/full-suite test pair evidence |
| Structural Evidence First-Pass Review | [structural-evidence-first-pass.md](structural-evidence-first-pass.md) | 026-2 | Structural pipeline/orchestration reviews require executable evidence for state, artifact, authz, response, and cwd/path invariants |
| Draft ROUTING | [draft-routing.md](draft-routing.md) | 1 (enforcement) | Emit IN_PROGRESS ROUTING after first substantive Edit |
| Large-Diff Batching | [large-diff-batching.md](large-diff-batching.md) | 2 | Batch 3-4 files, write findings per batch; avoid zero-output stall |
| Investigation Budget Cap | [investigation-budget-cap.md](investigation-budget-cap.md) | 2 (cap) | Max 3 tool_uses per finding; unconfirmed → FOLLOWUP in open-items |
| Deferred Scope Check | [deferred-scope-check.md](deferred-scope-check.md) | 13 | Before rejecting for missing item, check plan's Out of Scope section |
| Release-Prep Not Blocking | [release-prep-not-blocking.md](release-prep-not-blocking.md) | 50-8 | version bump and CHANGELOG absence is an n-level reminder, not an M-level blocking finding — pidex-devops Stage 1 pre-flight is the appropriate gate for release-prep completeness |
| Live-Only MSW Fallback Check | [live-only-msw-fallback-check.md](live-only-msw-fallback-check.md) | 61-2 | For live-only endpoint work, reviewer must verify target endpoint has no global MSW fallback handler and confirm test-local evidence |
| Write-Path Triad First-Pass | [write-path-triad-first-pass.md](write-path-triad-first-pass.md) | PROC-104-D-2 | For first-pass review of write-path routes, require topology invariant, strict parse fail-closed, and non-leak outward error checks |
| UI Pattern Parity Review | [ui-pattern-parity-review.md](ui-pattern-parity-review.md) | UI-PATTERN-PARITY | UI implementations must be reviewed against UI Quality Contract/source pattern before QA |
| Execution Profile Diff Guard | [execution-profile-diff-guard.md](execution-profile-diff-guard.md) | EXECUTION-PROFILE-DIFF | Code review compares actual changed files/surfaces against approved profile/skipped-agent assumptions |
| Fallow Evidence for JS/TS Review | [fallow-evidence.md](fallow-evidence.md) | FALLOW-CODE-REVIEW | For JS/TS code review, run Fallow or document `FALLOW-SKIP`; for non-JS/TS, record explicit skip |
| Boundary Source-of-Truth Parity Review | [boundary-source-of-truth-parity.md](boundary-source-of-truth-parity.md) | BOUNDARY-SOT-PARITY | API/schema/provider/route/settings changes must use one source of truth or tested aliases; negative tests must assert intended failure cause |
| Lifecycle Route Success/Conflict Separation | [lifecycle-route-success-conflict-separation.md](lifecycle-route-success-conflict-separation.md) | 90-2 | Reject lifecycle tests that accept success and conflict statuses in the same assertion; require separate success and conflict cases |
| 503 All-Unavailable Nav Assertion | [all-unavailable-nav-assertion.md](all-unavailable-nav-assertion.md) | 74-3 | Degraded-capable routes require explicit all-unavailable nav assertion; static fallback in valid unavailable payload is reject-level |
| TDD Table Narrow Hotfix Escape | [tdd-table-narrow-hotfix-escape.md](tdd-table-narrow-hotfix-escape.md) | PIPELINE-ANALYST-1E | Tiny test-only/type-only/devops-blocker hotfixes may use explicit TDD N/A row with validation proof |
| Async CTA Proof Gate | [async-cta-proof-gate.md](async-cta-proof-gate.md) | 80-1 | Before APPROVED, evidence must prove pending label, disabled state, and duplicate-click block for each async CTA |
| Exact Taxonomy/Error-Code Assertions for Contract Scope | [exact-taxonomy-error-code-assertions.md](exact-taxonomy-error-code-assertions.md) | PROC-NEW-92-3 | Contract-scope reviews require exact deterministic code/taxonomy assertions; ambiguous checks are Major+ reject |
| Lifecycle-vs-Legacy Assertion Vocabulary Scan | [lifecycle-assertion-vocabulary-scan.md](lifecycle-assertion-vocabulary-scan.md) | PROC-NEW-93-3 | Contract/lifecycle reviews must scan for mixed assertion vocabulary and lane drift; mixed semantics are reject-level |
| Secondary Lane Write Fence | [secondary-lane-write-fence.md](secondary-lane-write-fence.md) | PARALLEL-LANE-WRITE-FENCE | Secondary code-review lanes may write only their expected secondary artifact; deferred findings stay in the secondary artifact for merge/adjudication, not `wiki/open-items.md` |

## How to use

Read this index at task start. Load specific rule files when relevant to current task.
