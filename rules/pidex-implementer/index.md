# pidex-implementer Rules Index

Last updated: 2026-05-18 (PROC-NEW-2)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Structural Code Search Default | [../shared/structural-code-search.md](../shared/structural-code-search.md) | PROC-AST-GREP-1 | Prefer ast-grep for structural code searches; use rg for literal text and document the chosen search evidence |
| Package Manager Equivalence | [../shared/package-manager-equivalence.md](../shared/package-manager-equivalence.md) | PROC-PACKAGE-MANAGER-1 | Use detected package-manager equivalents; pnpm native/default, npm compatibility, yarn/bun unsupported; avoid lockfile type changes and npx auto-downloads |
| No Force-Adding Ignored Files | [../shared/no-force-add-ignored-files.md](../shared/no-force-add-ignored-files.md) | PROC-GIT-IGNORE-1 | Never commit ignored runtime/operator artifacts; fix broad ignore patterns instead of using `git add -f`; run ignored-file guard before commit handoff |
| Greenfield JS/TS pnpm Bootstrap | [greenfield-js-pnpm-bootstrap.md](greenfield-js-pnpm-bootstrap.md) | PROC-PACKAGE-MANAGER-3 | Bootstrap new JS/TS projects with pnpm unless plan/user explicitly chooses npm compatibility |
| Local Operator Config Guard | [../shared/local-operator-config-guard.md](../shared/local-operator-config-guard.md) | PROC-LOCAL-CONFIG-1 | Mutable operator config must use ignored local overrides; public-default cleanup must not overwrite live dashboard/agent settings |
| Final ROUTING Parser Fixture Pack | [final-routing-parser-fixture-pack.md](final-routing-parser-fixture-pack.md) | 029-PI-3 | Prompt-contract/parser work must reuse shared final-ROUTING fixture pack with positive + required negative cases |
| API Fan-out Pre-CR Checklist | [api-fanout-pre-cr-checklist.md](api-fanout-pre-cr-checklist.md) | 71-1 | Fan-out API work requires pre-CR checklist for origin trust, dynamic port, timeout bounds, KPI truthfulness, sanitized errors |
| Mutation-Route Security/Authz Checklist | [mutation-route-security-authz-checklist.md](mutation-route-security-authz-checklist.md) | 026-1 | State-mutating API routes require session + ownership + cross-project negative proof before first review handoff |
| Write-Path Security Checklist | [write-path-security-checklist.md](write-path-security-checklist.md) | PROC-104-D-1 | Write-path mutations must prove fail-closed parse, topology invariants, non-leak outward errors, and rollback path before first CR |
| Skip-Safety Pre-Review Checklist | [skip-safety-pre-review-checklist.md](skip-safety-pre-review-checklist.md) | 021-2 | When skip logic touched, require pre-review safety checklist + negative-test proof before first review handoff |
| Security Remediation Dual Proof | [security-remediation-dual-proof.md](security-remediation-dual-proof.md) | 020-2 | Security remediation slices must show both adversarial block proof and fresh-run happy-path proof |
| Shared UI Primitives Default | [shared-ui-primitives-default.md](shared-ui-primitives-default.md) | UI-SHARED-PRIMITIVES | Inventory existing shared primitives before bespoke UI markup; semantic tables default to Table*/real table primitives |
| Release-Prep Typecheck Preflight | [release-prep-typecheck-preflight.md](release-prep-typecheck-preflight.md) | 5 | Run detected workspace/root typecheck equivalent before opening release-prep QA/UAT chain |
| Draft ROUTING | [draft-routing.md](draft-routing.md) | 1 (enforcement) | Emit IN_PROGRESS ROUTING immediately after first file write/edit |
| Design Review Must-Fix | [design-review-must-fix.md](design-review-must-fix.md) | 11 | Read design review Must-Fix section FIRST; each item = mandatory TDD requirement |
| Fix Loop Scope Cap | [fix-loop-scope-cap.md](fix-loop-scope-cap.md) | 14 | Address at most 3 findings per fix spawn; request second spawn for remainder |
| CHANGELOG Ordering | [changelog-ordering.md](changelog-ordering.md) | X2 | CHANGELOG first, then version bumps; budget cutoff after step 1 = recoverable |
| Stall-Recovery Checkpoint | [stall-recovery.md](stall-recovery.md) | 16 | At >75% maxTurns: stop, commit, finalize doc, emit ROUTING |
| Route-Deletion Test-Reference Audit | [route-deletion-test-audit.md](route-deletion-test-audit.md) | 21 | Before any route-deletion slice, grep all test files for deleted path strings and update/remove in same slice |
| Port-Change Package.json Audit | [port-change-package-audit.md](port-change-package-audit.md) | 22 | When plan changes server.port in vite.config.ts, audit package.json scripts for --port overrides and fix in same slice |
| Dep-Pruning Lockfile Regeneration | [dep-pruning-lockfile-regen.md](dep-pruning-lockfile-regen.md) | 23 | Any dep-pruning slice must regenerate the detected lockfile with the detected package-manager equivalent in the same slice |
| Impl Doc Before Final Tests | [impl-doc-before-final-tests.md](impl-doc-before-final-tests.md) | 35c | At >65% maxTurns: commit current state, write impl doc summary, THEN run final tests — not after |
| Provider-Optional Hook Pattern | [provider-optional-hook.md](provider-optional-hook.md) | 2 (Plan 38) | Use useSyncExternalStore with no-op fallback for Provider-optional components; conditional hooks prohibited |
| Block Comment Route-Path Hazard | [block-comment-route-hazard.md](block-comment-route-hazard.md) | 40a | Use `//` line comments in TS/JS files; `/* */` block comments with `*/route-path` substrings cause esbuild parse errors |
| Draft ROUTING Cleanup | [../pidex-designer/draft-routing-cleanup.md](../pidex-designer/draft-routing-cleanup.md) | 41b | Final ROUTING block must overwrite IN_PROGRESS draft; no dual blocks in committed doc |
| Capability-Limited Empty State TODO | [capability-limited-empty-state.md](capability-limited-empty-state.md) | 41d | When an empty/disabled state is caused by current API/adapter capability limitation (not permanent design), add a TODO comment at the render decision point |
| Wiki Concept Update Required | [wiki-concept-update-required.md](wiki-concept-update-required.md) | 42a | Wiki concept updates in Files in Scope must be committed in the same slice as the code that motivates them — not deferred to retro/PI |
| MSW Test-Local Registration Self-Check | [msw-test-local-registration.md](msw-test-local-registration.md) | 44a | When retiring a global MSW handler and adding component tests for the same route, verify server.use() is registered in beforeEach before running tests — do not assume the plan's AP citation is sufficient |
| RED Phase Commit Checkpoint | [red-phase-commit.md](red-phase-commit.md) | 45c | When a TDD slice creates a new test file, commit it immediately after RED confirmation — before writing any GREEN code; commit message: `chore: S<N> RED phase — <slug> tests (failing)` |
| New Query Key Invalidation Audit | [query-key-invalidation-audit.md](query-key-invalidation-audit.md) | 48-2 | For each new useQuery key in a spawn, verify every mutation callback that writes the same data source calls queryClient.invalidateQueries |
| New Endpoint MSW Handler Audit | [new-endpoint-msw-handler-audit.md](new-endpoint-msw-handler-audit.md) | 48-3 | For each new API route in a spawn, verify every component test file mounting a consumer has an MSW handler for the route |
| External API Live Verification | [external-api-live-verification.md](external-api-live-verification.md) | 50-9 | Before writing any adapter method for a real homelab service, run a live curl test to confirm HTTP method, URL, auth, and response shape; document result under "API Verification" in impl doc |
| Open Choice Pre-Selection | [open-choice-pre-selection.md](open-choice-pre-selection.md) | 51-3 | Briefing-note canonical choices are binding; implementer must not re-open critic's open implementation choice decisions |
| No-Op Slice Explicit Flag | [noop-slice-explicit-flag.md](noop-slice-explicit-flag.md) | 53-3 | When plan signals a slice is expected to be a no-op (state audit confirmed), declare it immediately and fast-forward to the next slice — do not re-run full verification suite |
| Screenshot Artifact Path Guard | [screenshot-artifact-path-guard.md](screenshot-artifact-path-guard.md) | 54-5 | Any implementer-created screenshots must go to project `.playwright/` (or plan-bound directory) and never into tracked source paths |
| State-Mutating API Idempotency Tests | [state-mutating-idempotency-tests.md](state-mutating-idempotency-tests.md) | 60-2 | Any POST/PUT/PATCH/DELETE write endpoint must include repeat-call idempotency coverage in same slice before handoff |
| Blocked Continuation Map + Defer Owner Contract | [blocked-continuation-map-defer-owner.md](blocked-continuation-map-defer-owner.md) | 019-2 | BLOCKED handoff must include C1..Cn continuation map, active blocked item, defer owner, resume condition, and evidence |
| Root Validation Command First | [root-validation-command-first.md](root-validation-command-first.md) | 74-2 | Run plan-defined root validation command set first; app-local override only when plan explicitly allows |
| Deferred Capability Evidence Snippet | [deferred-capability-evidence-snippet.md](deferred-capability-evidence-snippet.md) | 80-2 | Deferred/out-of-scope claims must include fixed snippet confirming scope boundary and tracked follow-up |
| RED/GREEN/Non-TDD Evidence Block | [red-green-non-tdd-evidence-block.md](red-green-non-tdd-evidence-block.md) | PROC-NEW-1 | Before first review request, implementation doc must show explicit RED, GREEN, and Non-TDD evidence lanes |

| Layout-Parity DOM Snapshot | [layout-parity-dom-snapshot.md](layout-parity-dom-snapshot.md) | 034-1 | For layout-parity tasks, snapshot DOM of reference element before writing code; never copy from sibling page; verify class list |
| Dashboard Route Parity Pre-Review Smoke | [dashboard-route-parity-pre-review-smoke.md](dashboard-route-parity-pre-review-smoke.md) | DASHBOARD-PARITY-SMOKE | Dashboard parity/query work must include route/API smoke matrix for planned surfaces, weekly/monthly tokens, live filter, and project page-key reset before code review |
| Bounded Fix Slice Plan | [bounded-fix-slice-plan.md](bounded-fix-slice-plan.md) | PROC-NEW-88-2 | Implementer MUST execute bounded spawn-ready slices with explicit objective, failure class, pass criteria, and next-slice trigger |
| Pre-CR Contract Gate (Allowlist + Tool/Action + Each-Item Proof) | [pre-cr-contract-gate.md](pre-cr-contract-gate.md) | PROC-NEW-92-1 | Before first review handoff for contract/parser work, prove allowlist checks, action taxonomy checks, and every-item validation evidence |
| Contract-Coherence Preflight | [contract-coherence-preflight.md](contract-coherence-preflight.md) | PROC-NEW-93-1 | Before first review handoff on contract/parser/lifecycle scope, verify status vocab, version lane, and route string coherence |
| Fixture-Catalog Combined Regression Command | [fixture-catalog-combined-regression-command.md](fixture-catalog-combined-regression-command.md) | PROC-NEW-2 | Fixture/catalog edits must run focused + combined regression command pair with root-isolation evidence before CR handoff |
## How to use

Read this index at task start. Load specific rule files when relevant to current task.
