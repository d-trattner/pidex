# Rule: Plan Pre-Submission Checklist (PROC-NEW-53-2)

**Applies to:** pidex-planner  
**Status:** Active  
**Introduced:** Plan 53 (2026-04-29)  
**Evidence:** Plan 53 critic required 2 cycles (initial REJECTED, then APPROVED_WITH_COMMENTS). The REJECTED findings were predictable style issues: HOW-leakage in acceptance criteria, informal BD-* naming, and AC naming inconsistency. These could have been caught before submission.

---

## Trigger

Before writing the final version of any plan doc and marking it ready for pidex-critic.

## Rule

Run this checklist mentally (or literally as a Bash grep) before treating the plan as submission-ready. A plan that fails 2+ items will predictably get a critic rejection on those items — fix them before submitting.

### Checklist

**1. Acceptance Criteria — WHAT not HOW**

- [ ] Every AC row describes the observable outcome, not the implementation mechanism.
- [ ] BAD: "S1 runs `bash <pidex-root>/install.sh` to propagate changes" → HOW-leakage.
- [ ] GOOD: "Active orchestrator environment reflects all source changes from this plan."
- [ ] Quick check: if an AC row contains a command, file path, or function name, it is probably HOW-leakage. Rewrite as a behavior that can be verified without knowing the implementation.

**2. Behavioral Binding (BD-*) Naming**

- [ ] Every behavioral binding has an explicit `BD-N:` header (e.g., `BD-1:`, `BD-2:`).
- [ ] No informal descriptions that would qualify as BDs (see [bd-binding-review-contract.md](bd-binding-review-contract.md)).
- [ ] BD numbering is sequential and starts at BD-1 (not BD-0 or BD-A).

**3. AC Naming Convention**

- [ ] Acceptance criteria use `AC-N` format (e.g., AC-1, AC-2, AC-3).
- [ ] No mixed naming: not "AC-A", "AC.1", "AC1", or unnumbered items masquerading as AC.
- [ ] If the plan has slices with slice-specific ACs, prefix with slice tag: `S1-AC-1`, `S2-AC-1`.

**4. Scope Table Completeness**

- [ ] In-Scope and Out-of-Scope sections are both present and non-empty.
- [ ] No BC claim in Value Statement that isn't enumerated in Scope table (see [value-statement-scope-alignment.md](value-statement-scope-alignment.md)).

**5. State Audit / S0 Accuracy (for maintenance/propagation plans)**

- [ ] If the plan starts with a state audit (S0), every S0 claim has a verification command listed.
- [ ] S0 must not assume state — it must verify state. "Source files are correct" is a claim; `grep <pattern> <file>` is verification.

**6. Environment Variables**

- [ ] All env var references use exact identifiers (see [env-var-naming.md](env-var-naming.md)).

**7. Behavioral Bindings Format**

- [ ] All BDs follow the verbatim-fixture or explicit-open-to-iteration format (see [bd-binding-review-contract.md](bd-binding-review-contract.md)).

## Quick HOW-Leakage Scan

Read every AC row. For each row, ask: "Could I verify this AC without knowing how the code works?" If yes, it is a WHAT. If you need to look at specific code, commands, or files to know whether the AC passes, it may be HOW.

Common HOW-leakage patterns:
- AC contains a command (`grep`, `bash`, `curl`)
- AC contains a file path (`<pidex-root>/install.sh`)
- AC contains a function/method name
- AC says "the implementer should X" instead of "the system does X"

## Impact

Eliminates first-cycle rejections on formatting and naming style. The critic still applies its full analysis — but on substance (scope, completeness, feasibility), not on predictable style issues that pidex-planner can self-audit.

## Empirical basis

- Plan 53: critic REJECTED on (1) HOW-leakage in AC for propagation slice, (2) informal BD naming, (3) AC naming inconsistency. Second submission: APPROVED_WITH_COMMENTS. Both cycles could have reached APPROVED_WITH_COMMENTS in one cycle if the checklist had been applied.
- Plans 52, 50, 47: similar patterns (BD naming, env var naming) already addressed by companion rules. This checklist aggregates them into a single pre-submission gate.
