# Fallow Policy (runningpi)

Short standard checklist for which `fallow` commands each agent role should run.

## Shared ground rules
- Add `--format json` to analysis subcommands by default when it is not already set.
- Never run `fix` unchecked: use `--dry-run` first, then run with `--yes`.
- For CI/PR gates, always run at least one new-only baseline check against the target branch.

---

## pidex-implementer
Goal: verify a clean change scope before commit or local handoff.

- [ ] `fallow dead-code --changed-since main --format json`
- [ ] `fallow dupes --changed-since main --format json`
- [ ] Optional: `fallow fix --dry-run --format json` (only for a specific cleanup task)
- [ ] For new findings: document or fix them, then re-run (for `fix`, only after `--dry-run` review)

---

## pidex-qa
Goal: protect QA completion and UAT handoff.

- [ ] `fallow audit --changed-since main --gate new-only --format json`
- [ ] `fallow health --format json`
- [ ] On pass: record the result in the QA document as a "fallow gate check"
- [ ] On warning/fail: coordinate with the implementer; do not grant final approval

---

## pidex-security
Goal: security/gate review for refactors or new architecture changes.

- [ ] `fallow audit --changed-since main --gate new-only --format json`
- [ ] `fallow dead-code --changed-since main --format json`
- [ ] Treat findings as risk signals in security routing; do not accept silent passes

---

## pidex-architect / pidex-planner
Goal: architecture planning and repository analysis before/after larger changes.

- [ ] `fallow list --format json`
- [ ] `fallow flags --format json` (if feature flags or switching behavior are relevant)
- [ ] For notable findings: record repo-wide policy/boundary notes in the architecture notes

---

## pidex-devops
Goal: release and CI gates.

- [ ] `fallow audit --changed-since main --gate all --format json`
- [ ] `fallow dead-code --format json`
- [ ] For release decisions: track exceptions/ignore strategy in writing

---

## Quick chat hint
- `/fallow-policy <agent>` shows the matching role policy (agent = implementer | qa | security | architect | devops)
