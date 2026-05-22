# Project Boundary Write Guard

## Purpose

Prevent project-identity drift where a PIDEX pipeline for one project mutates another project repository.

## Rule

A PIDEX pipeline may only mutate files under its declared `<project-root>` / allowed write root.

The host orchestrator and every spawned `pidex-*` agent must treat all other repositories as read-only reference material unless the user explicitly switches project and starts a new pipeline for that target root.

## Allowed without project switch

- Read external repositories for context.
- Cite external paths in analysis.
- Write recommendations or follow-up notes inside the current project's `agents.output/**`.
- Capture a future-plan brief in a user-approved global planning location such as `~/obsidian-wikis/global/plans/**` when the user explicitly asks for a cross-project follow-up note.

## Forbidden without explicit project switch

- Edit files outside `<project-root>`.
- Run implementation work in another repo.
- Commit, tag, push, reset, or change Git config in another repo.
- Apply PI/rule/context/wiki changes to another project.
- Start a new implementation pipeline in another project while still operating under the current project's pipeline.
- Treat `<pidex-root>` as writable merely because PIDEX rules/prompts are referenced for context.

## Explicit project switch requirement

Cross-project mutation is allowed only after the user explicitly says to switch the active project, for example:

```text
Switch project to ~/pidex and start a PIDEX pipeline for that project.
```

A vague statement such as "PIDEX should improve this later" or "make a follow-up" is not permission to mutate PIDEX. Capture a brief/follow-up plan instead.

## Required task briefing block

Every specialist handoff must include a project boundary block:

```text
PROJECT BOUNDARY:
- Current project root: <project-root>
- Allowed write root: <project-root>
- Read-only external reference roots: <paths, if any>
- Do not edit/commit/tag/push outside allowed write root.
```

If the task involves a lane worktree, the allowed write root may be that lane worktree, but it must still belong to the same project pipeline and be named explicitly.

## Drift detection response

If the orchestrator or agent notices work has drifted outside the allowed write root:

1. Stop immediately.
2. Do not push/tag/release the cross-project changes.
3. Emit `pipeline_blocked` or `pipeline_aborted` for the current pipeline, depending on recoverability.
4. Explain the cross-project drift and list touched paths.
5. Quarantine or preserve evidence only after user approval.
6. Capture the underlying issue as a follow-up brief/plan if useful.
7. Return to the original project scope or wait for explicit user project switch.

## Review checklist

Before DevOps/release, confirm all committed/staged paths are under the allowed write root. If any staged path is outside the allowed root, block release and route to user.
