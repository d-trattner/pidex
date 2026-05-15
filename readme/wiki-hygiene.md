# Wiki Hygiene

PIDEX can audit a project's canonical wiki and write a read-only hygiene report.

Canonical wiki path:

```text
<project-root>/wiki/
```

## Run

In Pi:

```text
/pdwiki
/pdwiki /path/to/project
```

Direct script:

```bash
python3 <pidex-root>/scripts/wiki/hygiene.py audit --project <project-root>
```

## Outputs

Reports are written to:

```text
<project-root>/agents.output/wiki-hygiene/YYYY-MM-DDTHH-MM-SSZ-report.md
<project-root>/agents.output/wiki-hygiene/YYYY-MM-DDTHH-MM-SSZ-report.json
```

Audit mode does not edit `wiki/`.

## Checks

The audit checks for:

- missing `wiki/`, `wiki/index.md`, or `wiki/log.md`
- broken Markdown links
- broken Obsidian wikilinks and embeds
- ambiguous wikilinks
- orphan pages
- stale pages/open items
- duplicate titles
- legacy `agents.wiki.*` references
- possible secrets, redacted in reports

## Severity

- critical: possible secrets, missing canonical structure, active legacy write instructions
- high: broken index links, missing `log.md`, contradictory active decision-page hints
- medium: broken non-index links, orphans with useful content, stale decisions/open items
- low: minor formatting/staleness/legacy references

## Cadence

Terminal pipeline events can update:

```text
<project-root>/wiki/.hygiene-state.json
```

The first implementation tracks cadence only. Automatic cadence must never apply changes.

## Apply mode

Apply mode is future work. Any mutation must require an explicit user gate, backups, validation, and a scoped commit.
