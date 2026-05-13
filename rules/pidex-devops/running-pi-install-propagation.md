# Rule: running-pi Install Propagation After Source-Touching Plans (PROC-NEW-53-1)

**Applies to:** pidex-devops (Stage 1)  
**Status:** Active  
**Introduced:** Plan 53 (2026-04-29)  
**Evidence:** Plan 53 was entirely a propagation plan — fixes already written to `<pidex-root>/` source in Plan 52 never reached the active orchestrator environment because `install.sh` was not run. Required a full separate plan cycle just to propagate.

---

## Trigger

Plan touches any file under `<pidex-root>/` source directory, including:
- `<pidex-root>/docs/rule-*.md`
- `<pidex-root>/scripts/` (any script)
- `<pidex-root>/templates/`
- `<pidex-root>/rules/<agent>/` rule files (though pidex-pi usually writes these)
- Any other file that `install.sh` copies to project `.claude/agents/` or `~/.claude/running-pi-instructions.md`

## Rule

After Stage 1 commit and BEFORE emitting Stage 1 complete signal, run:

```bash
bash <pidex-root>/install.sh
```

Log the output. If `install.sh` fails, report the error in the deployment doc — do NOT silently skip propagation. A failed propagation must be surfaced, not suppressed.

## What to document in the deployment doc

Add a section after the Stage 1 summary:

```markdown
## running-pi Propagation

- Triggered: yes (plan touched <pidex-root>/ source files)
- Command: `bash <pidex-root>/install.sh`
- Result: [success | FAILED — <error>]
- Files updated: [output from install.sh or "see install log"]
```

If the plan did NOT touch `<pidex-root>/`, write:

```markdown
## running-pi Propagation

- Triggered: no (plan did not touch <pidex-root>/ source files)
```

## Rationale

`<pidex-root>/` is the canonical source for pipeline agent instructions, scripts, and rules. Project-level `.claude/agents/pidex-*.md` files and `~/.claude/running-pi-instructions.md` are installed copies. Changes to source files have no effect until `install.sh` propagates them.

The "deferred propagation" pattern (fix now, propagate in a future plan) creates a silent mismatch window where the active pipeline runs stale instructions. For critical infrastructure fixes (heartbeat, watchdog, gate routing), this window can span multiple runs.

## Exemptions

- Plans that modify only `<pidex-root>/rules/<agent>/` rule files (not agent `.md` files): `install.sh` may not copy rules, but run it anyway if uncertain — it is idempotent.
- Plans that do NOT touch any `<pidex-root>/` path: skip this rule entirely (document "Triggered: no").

## Empirical basis

- Plan 52 wrote subagent monitoring fixes to `<pidex-root>/` source.
- Plan 53 existed solely to propagate those fixes to the active environment.
- Cost: one full pipeline cycle (planner → critic × 2 → implementer → code-reviewer → qa → uat → devops → retrospective → pi) to deliver a `bash <pidex-root>/install.sh` that could have been part of Plan 52's devops stage.
