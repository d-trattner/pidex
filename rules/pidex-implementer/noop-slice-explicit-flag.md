# Rule: No-Op Slice — Explicit Flag and Fast-Forward to Propagation (PROC-NEW-53-3)

**Applies to:** pidex-implementer  
**Status:** Active  
**Introduced:** Plan 53 (2026-04-29)  
**Evidence:** Plan 53 S0 (source gap-fill) was a no-op — the state audit had already confirmed source files were correct. The implementer proceeded through S0 motions (re-reading, re-verifying) before reaching the propagation slice. Tokens spent re-verifying what the plan had already confirmed.

---

## Trigger

Any slice (typically S0 or a "gap-fill" slice) where the plan doc explicitly states:

- "state audit confirmed: no changes needed"
- "source files already contain the required content"
- "this slice is a verification slice; implementation may be a no-op"
- Or equivalent — plan pre-determined the slice produces no code diff.

## Rule

When the plan signals that a slice is expected to be a no-op:

1. **Declare the no-op explicitly** in the impl doc immediately:
   ```markdown
   ### S0 — Source Gap-Fill
   **Status: NO-OP** — state audit (pre-plan) confirmed source files already contain
   all required content. No file edits performed. Verified via:
   - `grep "PROC-NEW-36e" ~/running-pi/docs/rule-09-briefing-discipline.md` → found ✓
   - `grep "check-heartbeat" ~/running-pi/scripts/pre-spawn/pidex-qa-prep.sh` → found ✓
   ```

2. **Do NOT re-run the full verification suite** from scratch. Run at most one confirmatory grep per file claimed complete. Trust the plan's state audit. If the audit said "file X contains pattern Y," one `grep` to confirm is sufficient — do not open the file and re-read the entire content.

3. **Immediately proceed to the next slice** — no commit for the no-op slice (nothing to commit), no pause.

4. **If the confirmatory grep fails** (state audit was wrong), treat this as a plan discrepancy:
   - Write the missing content
   - Note the discrepancy in the impl doc: "State audit claimed X was present; actual verification found it absent. Added per plan spec."
   - Continue to propagation.

## What NOT to do

- Do NOT open and fully read every file the audit claimed was correct.
- Do NOT re-derive what the correct content should be (the plan already determined this).
- Do NOT write a commit for a slice with zero file changes.
- Do NOT treat the no-op finding as a reason to skip the propagation slice — propagation is typically the POINT of the plan.

## Fast-Forward to Propagation

After the no-op confirmation:

```
S0 confirmed no-op → proceed directly to S1 (propagation) → run propagation → commit propagation → verify
```

The budget saved by skipping S0 re-verification belongs to S1 (propagation verification, which may involve running `install.sh`, checking file diffs, and confirming the active environment reflects changes).

## Empirical basis

- Plan 53: S0 gap-fill was confirmed no-op by pre-plan state audit. Implementer re-read source files and re-verified content already confirmed by the audit. This cost ~8-10 tool calls that could have been the impl doc declaration + immediate S1 start.
- Pattern: propagation plans (where the fix is already in source, plan exists to install it) will frequently have no-op S0 slices. This is expected and good — it validates the pre-plan audit. The waste is in treating it as a normal implementation slice.
