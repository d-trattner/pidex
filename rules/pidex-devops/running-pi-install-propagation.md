# Rule: running-pi Install Propagation After Source-Touching Plans (PROC-NEW-53-1)

**Applies to:** pidex-devops (Stage 1)  
**Status:** Active  
**Introduced:** Plan 53 (2026-04-29)  
**Evidence:** Plan 53 was entirely a propagation plan — fixes already written to `~/running-pi/` source in Plan 52 never reached the active orchestrator environment because `install.sh` was not run. Required a full separate plan cycle just to propagate.

---

## Trigger

Plan touches any file under `~/running-pi/` source directory, including:
- `~/running-pi/docs/rule-*.md`
- `~/running-pi/scripts/` (any script)
- `~/running-pi/templates/`
- `~/running-pi/rules/<agent>/` rule files (though pidex-pi usually writes these)
- Any other file that `install.sh` copies to project `.claude/agents/` or `~/.claude/running-pi-instructions.md`

## Rule

After Stage 1 commit and BEFORE emitting Stage 1 complete signal, run:

```bash
bash ~/running-pi/install.sh
```

Log the output. If `install.sh` fails, report the error in the deployment doc — do NOT silently skip propagation. A failed propagation must be surfaced, not suppressed.

## What to document in the deployment doc

Add a section after the Stage 1 summary:

```markdown
## running-pi Propagation

- Triggered: yes (plan touched ~/running-pi/ source files)
- Command: `bash ~/running-pi/install.sh`
- Result: [success | FAILED — <error>]
- Files updated: [output from install.sh or "see install log"]
```

If the plan did NOT touch `~/running-pi/`, write:

```markdown
## running-pi Propagation

- Triggered: no (plan did not touch ~/running-pi/ source files)
```

## Rationale

`~/running-pi/` is the canonical source for pipeline agent instructions, scripts, and rules. Project-level `.claude/agents/pidex-*.md` files and `~/.claude/running-pi-instructions.md` are installed copies. Changes to source files have no effect until `install.sh` propagates them.

The "deferred propagation" pattern (fix now, propagate in a future plan) creates a silent mismatch window where the active pipeline runs stale instructions. For critical infrastructure fixes (heartbeat, watchdog, gate routing), this window can span multiple runs.

## Exemptions

- Plans that modify only `~/running-pi/rules/<agent>/` rule files (not agent `.md` files): `install.sh` may not copy rules, but run it anyway if uncertain — it is idempotent.
- Plans that do NOT touch any `~/running-pi/` path: skip this rule entirely (document "Triggered: no").

## Empirical basis

- Plan 52 wrote subagent monitoring fixes to `~/running-pi/` source.
- Plan 53 existed solely to propagate those fixes to the active environment.
- Cost: one full pipeline cycle (planner → critic × 2 → implementer → code-reviewer → qa → uat → devops → retrospective → pi) to deliver a `bash ~/running-pi/install.sh` that could have been part of Plan 52's devops stage.
