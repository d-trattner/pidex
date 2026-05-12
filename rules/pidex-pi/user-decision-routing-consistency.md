# Rule: PI User Decision Routing Consistency

PROC-NEW-PI-DECISION | pidex-pi / orchestrator

## Rule

When `pidex-pi` proposes agent, rule, workflow, or process-instruction changes that require user approval, it must route to `user`, not `pidex-roadmap`.

A PI artifact has an unresolved user decision when it contains any of these markers:

- `User Decision Required`
- `Gate G7`
- `approve-all`
- `defer`
- `reject`
- `Suggested Agent Instruction Updates`
- proposed edits to `agents/*.md`, `rules/**`, workflow docs, or project-specific rule files

In that case final ROUTING must be:

```html
<!-- ROUTING
verdict: BLOCKED
route_to: user
context_file: <pi-artifact>
gate: G7
reason: user approval required before applying/defering/rejecting PI rule/instruction changes
<!-- /ROUTING -->
```

If the PI artifact only records advisory observations and no decision markers, it may route to `pidex-roadmap`.

## Orchestrator enforcement

After every `pidex-pi` return, orchestrator must read the returned `context_file` and scan for unresolved decision markers above before following ROUTING.

If ROUTING says `pidex-roadmap` but the PI doc contains unresolved decision markers:

1. Treat ROUTING as inconsistent.
2. Do **not** continue to roadmap.
3. Ask user to choose: `approve-all`, `approve selected`, `defer`, or `reject`.
4. Resume according to user answer.

## Why

PI can correctly analyze process improvements while accidentally emitting `route_to: pidex-roadmap`. Without this rule, pipelines can auto-complete while approval-needed rule changes remain unresolved. That creates false completion and loses improvement decisions.

## Evidence pattern

Record in PI doc or orchestrator notes:

```text
PI decision scan: found User Decision Required + Suggested Agent Instruction Updates.
Action: paused pipeline; asked user before roadmap.
```

## Scope

Global PIDEX pipeline rule. Applies to all projects because PI approval semantics are process-level, not product-specific.
