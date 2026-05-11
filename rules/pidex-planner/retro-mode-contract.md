# Rule: Retro Mode Contract

PROC-NEW-RETRO-MODE | pidex-planner

## Goal

Make closing-phase cost explicit. Small safe tasks should not require full retrospective/PI/roadmap handoffs, while high-signal incidents must still force full learning loop.

## Required section

Every plan MUST include retro mode in `Execution Profile` or a nearby section:

```markdown
Retro Mode: <none | mini | full>
Retro reason: <one sentence>
Post-retro handoffs: <none | pidex-pi | pidex-planner | pidex-roadmap | pidex-architect, ...>
```

## Modes

| Mode | Use when | Output |
|---|---|---|
| `none` | docs-only/test-data-only/small local fix with no findings, no release, no user-visible risk | no retrospective agent |
| `mini` | normal completed small/standard work with no rejection/security/process findings | 3-5 line mini retro in deployment or QA/UAT/deployment summary |
| `full` | release close, G9 rejection, security finding, process finding, major review rejection loop, multi-agent failure, agent stall/recovery, user escalation, high-risk-release | `pidex-retrospective` doc + `pidex-pi` processing |

## Mandatory full retro triggers

Plan MUST declare `Retro Mode: full` when any of these are in scope or occur during delivery:

- release close / versioned release bundle
- G9 rejection or repeated user-preview loop
- security finding, security bypass/exception, or planned scope that changes security controls
- code-review/QA/UAT gate with repeated rejection loop or two-or-more Major findings, or planned scope expected to require multi-review remediation loop
- process finding, agent stall/recovery, multi-agent failure
- structural migration or high-risk-release
- user explicitly asks to capture process lessons

## Post-retro handoff rules

- `pidex-pi` only when process improvements exist or full retro runs.
- `pidex-planner` only when planning insights exist.
- `pidex-roadmap` only when product/backlog/project improvement findings exist.
- `pidex-architect` only when architecture patterns/decisions need evergreen docs.

## Safety

If uncertain, choose `mini`; if any mandatory trigger exists, choose `full`.

## Empirical basis

Harness improvement plan Part A: closing phase can be shortened for low-risk work, but G9/security/process incidents must still create durable lessons.
