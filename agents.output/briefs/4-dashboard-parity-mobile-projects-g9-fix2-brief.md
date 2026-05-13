# Implementer G9 fix2 brief

Project cwd: `<pidex-root>`
Code review rejection: `agents.output/code-review/4-dashboard-parity-mobile-projects-g9-fix-code-review.md`
Expected output: `agents.output/implementation/4-dashboard-parity-mobile-projects-g9-fix2.md`

Fix only the rejected mobile Quality CSS cascade issue:
- `.quality-card`/`.quality-metric-card` full-row mobile rules are overridden by later `.glass-card { grid-column: span 4; }`.
- Use higher-specificity selectors after base rule, e.g. `.glass-card.quality-card { grid-column: 1 / -1; }` and `.glass-card.quality-metric-card { grid-column: 1 / -1; }`.
- Preserve desktop restore inside `@media (min-width: 900px)` with same/higher specificity.
- Strengthen regression test so it catches cascade/source-order issue, not only rule presence.
- Run focused test and typecheck.

ROUTING context_file must be expected output; route to pidex-code-reviewer.
