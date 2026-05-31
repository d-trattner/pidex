# Orchestrator No-Direct-Implementation Guard

## Purpose

Prevent the host `/pidex` or `/pd` orchestrator session from bypassing the specialist pipeline by editing implementation files itself.

## Rule

For any PIDEX pipeline that changes product/project files, the orchestrator must route implementation through `pidex_agent` specialist handoffs. The orchestrator must not directly edit, write, patch, or commit implementation files before the appropriate specialist has been invoked.

Required minimum route for product/project changes:

1. `pidex-planner` unless the task is an explicitly approved resume of an existing implementation-ready plan.
2. `pidex-implementer` for source/docs/config/test changes.
3. `pidex-code-reviewer`, `pidex-security` when applicable, `pidex-qa`, and later gates according to the approved execution profile and routing table.

## Allowed orchestrator writes

The orchestrator may write only coordination artifacts before specialist implementation:

- `agents.output/context/**` compact context/preflight packs;
- `agents.output/.next-id` initialization;
- `pidex/context/CONTEXT.md` initialization when required by `/pidex` preflight;
- minimal `wiki/index.md` / `wiki/log.md` bootstrap only when the project has no PIDEX wiki yet and the skill requires it;
- pipeline/history/event metadata emitted by PIDEX scripts;
- user-approved gate/decision evidence.

These coordination writes must still obey the project boundary write guard.

## Forbidden orchestrator actions before implementer

Before `pidex-implementer` has run, the orchestrator must not:

- edit project source files;
- edit tests;
- edit project documentation as the implementation itself;
- create feature files;
- fix bugs directly;
- commit implementation changes;
- treat a tiny/simple task as permission to skip specialists.

## Fallback exception

Orchestrator-direct implementation is allowed only under the documented stall fallback path:

- repeated specialist stalls or malformed/no-progress returns;
- recovery attempts failed;
- the fallback is explicitly documented as `PROC-NEW-10 orchestrator-direct fallback`;
- the generated artifact identifies the reviewer/implementer as orchestrator-direct;
- the operator is informed that the normal specialist route was bypassed.

This exception must not be used simply because the task is small.

## Detection response

If the orchestrator realizes it edited implementation files directly by mistake:

1. Stop direct editing immediately.
2. Record the incident in the smoke/pipeline report.
3. Prefer reset/rerun from clean state with explicit specialist-handoff requirement.
4. If reset is not possible, route to `pidex-code-reviewer` and `pidex-qa` with the direct-edit incident disclosed.

## Smoke-test instruction

Remote smoke tests that validate the real `/pd` path should include this explicit sentence in the user prompt until this behavior is repeatedly proven stable:

```text
This is a PIDEX pipeline smoke: you MUST use pidex_agent specialist handoffs, starting with pidex-planner; do not edit files directly in the orchestrator before planner/implementer handoffs.
```
