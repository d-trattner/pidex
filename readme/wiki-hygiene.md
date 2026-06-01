# Wiki Hygiene

PIDEX can audit a project's canonical wiki and write a read-only hygiene report.

Canonical wiki path:

```text
<project-root>/wiki/
```

## Run

In Pi, after `/reload`:

```text
/pdwiki
/pdwiki /path/to/project
```

Direct script:

```bash
node <pidex-root>/scripts/modules/run-check.mjs --capability memory-wiki-hygiene.check --agent pidex-wiki-hygienist --phase maintenance --project <project-root>
```

## Outputs

Reports are written to:

```text
<project-root>/agents.output/wiki-hygiene/YYYY-MM-DDTHH-MM-SSZ-report.md
<project-root>/agents.output/wiki-hygiene/YYYY-MM-DDTHH-MM-SSZ-report.json
```

Audit mode does not edit `wiki/`. It updates only `<project-root>/pidex/state/wiki-hygiene.json` as operational state and does not mutate any other `<project-root>/pidex/**` path.

## Checks

The audit checks for:

- missing `wiki/`, `wiki/index.md`, or `wiki/log.md`
- broken Markdown links
- broken Obsidian wikilinks and embeds
- ambiguous wikilinks
- orphan pages
- stale pages/open items
- duplicate titles
- project-wiki graph convention diagnostics:
  - missing folder indexes for active top-level wiki folders
  - missing `## Navigation` on priority index/hub pages
  - unexpected non-index hubs with high inbound link counts
  - connected component, inbound, outbound, frontmatter, and navigation counts
- legacy `agents.wiki.*` references
- possible secrets, redacted in reports

## Severity

- critical: possible secrets, missing canonical structure, active legacy write instructions
- high: broken index links, missing `log.md`, contradictory active decision-page hints
- medium: broken non-index links, orphans with useful content, stale decisions/open items
- low: minor formatting/staleness/legacy references and report-only graph convention findings

## Specialist agent

PIDEX also includes a specialist agent:

```text
pidex-wiki-hygienist
```

It can run through `pidex_agent` for pipeline handoffs. Default mode is read-only audit; it must not edit `wiki/`, mutate `<project-root>/pidex/**`, or create `agents.wiki.*`.

## Cadence

Terminal pipeline events can update:

```text
<project-root>/pidex/state/wiki-hygiene.json
```

The audit and cadence helpers may update only that single PIDEX metadata file. Audit records `last_hygiene_at`, report paths, status, and resets the run counter. Automatic cadence must never apply changes. When the counter reaches the configured threshold, run `/pdwiki` to create a fresh report.

Audit/report-only orchestrated runs should be performed by `pidex-wiki-hygienist`, not by the orchestrator directly. The specialist should finish with a brief: score, severity counts, top findings, report path, state path updated, and whether wiki content changed. Hygiene reports under `agents.output/**` are generated artifacts and must not be committed. The orchestrator should relay the brief and ask whether to commit the hygiene state file, listing `pidex/state/wiki-hygiene.json` as the audit-only commit candidate. If the user approves, the orchestrator stages that exact file and commits it; use `git add -f pidex/state/wiki-hygiene.json` if `pidex/state/` is ignored. If a future apply mode mutates `wiki/**`, ask about committing those wiki changes too.

Project-specific PIDEX agent rules live in:

```text
<project-root>/pidex/rules/<agent>.md
```

`wiki/` remains durable project knowledge; `pidex/` is operational metadata.

## Apply mode

Apply mode is future work. Any mutation must require an explicit user gate, backups, validation, and a scoped commit. Future wiki hygiene apply mode may only mutate `<project-root>/wiki/**`; PIDEX metadata cleanup needs a separate workflow.

If a user asks the wiki hygienist to execute/apply hygiene, the specialist must create a separate execution report:

```text
<project-root>/agents.output/wiki-hygiene/<timestamp>-execution-report.md
```

The execution report must reference the source audit report, list actions taken or `NO_CHANGES_APPLIED`, changed files, skipped/deferred items, validation, and commit recommendation. It must not overwrite the deterministic audit report.
