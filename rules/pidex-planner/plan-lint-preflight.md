# Plan Lint Preflight

PROC-NEW-69-2 | pidex-planner

## Trigger

Run before critic handoff for every plan that has any of:

- `Execution Profile`
- `Skipped Agents`
- `Retro Mode`
- target release/version metadata
- G9/user rejection continuation
- mandatory retro trigger marker

## Requirement

Planner MUST add a compact `Plan Lint Preflight` section and resolve all FAIL rows before routing to `pidex-critic`.

## Required checks

| Check | PASS condition | FAIL condition |
|---|---|---|
| Execution Profile enum | Profile uses a known value accepted by current orchestrator/rules (e.g. `ui-heavy`, `standard`, `bugfix`, `structural`, or project-defined profile) | Ad-hoc/non-standard label with no definition |
| Skipped Agents declaration | Section exists and each skip has reason + critic-safe condition, or says `none` | Missing section when profile mentions skips |
| Retro Mode consistency | `full` when mandatory trigger exists (G9 rejection, security risk acceptance/finding, process/multi-agent failure); otherwise declared `none|mini|full` with rationale | Mandatory trigger present but retro mode is `none`/`mini`, or missing retro mode |
| Target release/version coherence | Target release matches current repo release line or explicitly declares next bump/hold policy with artifact paths | Stale release copied from older plan, mismatch with package/changelog without rationale |
| Epic label vs semver taxonomy | Product epic label is explicitly distinguished from package semver/tag lane | Treating `Epic 11.5` as package tag `v11.5.0` without explicit user decision |
| G9 applicability | UI plans declare G9 required or not applicable with reason | UI plan lacks G9 decision |
| Artifact path uniqueness | Parallel/secondary lane output paths are unique when specified | Multiple lanes instructed to write same artifact path |

## Template

```markdown
## Plan Lint Preflight

| Check | Result | Evidence / Action |
|---|---:|---|
| Execution Profile enum | PASS | `ui-heavy` |
| Skipped Agents declaration | PASS | `none` |
| Retro Mode consistency | PASS | `full`; mandatory G9 rejection marker present |
| Target release/version coherence | PASS | `v0.10.18` matches `package.json` |
| G9 applicability | PASS | G9 required |
| Artifact path uniqueness | PASS | secondary lanes use suffixed paths |
```

## Routing rule

If any row is FAIL, planner MUST revise the plan before routing to critic. Do not rely on critic to catch deterministic plan-lint failures.
