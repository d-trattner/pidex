# Secondary Lane Write Fence

## Trigger

This rule applies when `pidex-code-reviewer` is running as a configured parallel secondary lane, not as the primary code-review lane.

Signals include any of:

- task text says `configured secondary review lane`
- expected output path is under `agents.output/parallel-agents/`
- provider/model override indicates an auxiliary code-review lane
- orchestrator asks for secondary/parallel code review

## Rule

Secondary code-review lanes may write **only their assigned artifact file**.

The assigned artifact file is the exact output path given by the orchestrator, normally under `agents.output/parallel-agents/`.

No other writes are allowed. This includes project wiki, roadmap, `wiki/open-items.md`, source files, rules, configs, primary artifacts, temp project files, or helper outputs.

## Deferred findings

If a secondary lane finds a non-blocking/deferred issue, include it in the secondary review artifact under a clearly labelled section such as:

```md
## Secondary Deferred Findings Candidates

- <finding-id> — <summary> — suggested disposition: open-items | roadmap | no-action
```

The orchestrator or primary merge/adjudication step decides whether to write any follow-up elsewhere.

## Why

Parallel secondary lanes are advisory. Letting them write durable project memory can create races, duplicate open-items, contradictory state, or unexpected mutations that the primary lane/merge summary has not adjudicated.
