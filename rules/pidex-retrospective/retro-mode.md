# Rule: Retro Mode

PROC-NEW-RETRO-MODE | pidex-retrospective

## Rule

pidex-retrospective should run only for `Retro Mode: full` or when orchestrator/user explicitly requests a full retro after delivery.

## Modes

| Mode | Retrospective behavior |
|---|---|
| `none` | Do not run pidex-retrospective. No retro doc. |
| `mini` | Do not run pidex-retrospective by default. Mini retro belongs in QA/UAT/deployment summary. |
| `full` | Run pidex-retrospective and route to pidex-pi for process extraction. |

## Mandatory full retro triggers

If any trigger is present, upgrade to full retro even if plan says `none` or `mini`:

- G9 rejection / repeated preview loop
- security finding or exception
- repeated rejection loop or two-or-more Major review findings
- process finding, agent stall/recovery, multi-agent failure
- release close / high-risk-release
- user asks to capture process lesson

## If invoked for `none` or `mini`

Write a short doc with verdict `BLOCKED` and reason: `retro mode does not require full retrospective`. Route to `user` or orchestrator. Do not create process findings unless a mandatory full-retro trigger is discovered.

## Empirical basis

Full retros are valuable but costly. Running them for every small task increases latency and document noise; mandatory triggers preserve learning where it matters.
