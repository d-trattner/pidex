# Rule: Retro Mode Safety Check

PROC-NEW-RETRO-MODE-SAFETY | pidex-critic

## Trigger

Load for every plan review.

## Rule

pidex-critic MUST verify `Retro Mode` is declared and safe for plan risk. Missing or unsafe retro mode is a plan-quality finding.

## Required checks

1. Plan declares `Retro Mode: none | mini | full`.
2. Plan gives one-line reason.
3. Plan declares post-retro handoffs or `none`.
4. Mandatory full-retro triggers are not downgraded to `none`/`mini`.
5. Post-retro handoffs match finding types.

## Severity

| Finding | Severity | Verdict guidance |
|---|---|---|
| Missing Retro Mode | LOW | APPROVED_WITH_COMMENTS for legacy/small plans; REJECTED if closing behavior is ambiguous/high-risk |
| G9 rejection scope with `none`/`mini` | MEDIUM | REJECTED |
| Security/process/multi-agent failure with `none`/`mini` | MEDIUM | REJECTED |
| Repeated rejection loop or two-or-more Major review findings with `none`/`mini` | MEDIUM | REJECTED unless plan has explicit user-approved no-full-retro waiver |
| Release close with `none`/`mini` | MEDIUM | REJECTED unless user explicitly approved no retro |
| Product/backlog findings route to `pidex-pi` only | LOW | APPROVED_WITH_COMMENTS; route should include `pidex-roadmap` |
| No process findings but `pidex-pi` required | LOW | APPROVED_WITH_COMMENTS; suggest removing unnecessary handoff |

## Valid examples

```markdown
Retro Mode: none
Retro reason: docs-only spelling update; no process, release, UI, or product findings expected.
Post-retro handoffs: none
```

```markdown
Retro Mode: full
Retro reason: G9 rejection loop occurred; process lesson required.
Post-retro handoffs: pidex-pi
```

## Empirical basis

Closing handoffs can consume meaningful runtime. Mini/none modes are safe only when high-signal learning triggers are absent.
