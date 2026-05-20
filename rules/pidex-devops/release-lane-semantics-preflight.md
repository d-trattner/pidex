# Rule: Release-Lane Semantics Preflight Before G4

PROC-NEW-SEMVER-2 | pidex-devops

## Trigger

Run before Stage 1 local commit closure and again before any G4 `push/local/hold/abort` prompt when a plan has a target release/version, roadmap epic label, package metadata, changelog, tag, or publish path.

## Rule

DevOps must verify that release-lane semantics are coherent before asking the user for G4 or creating/pushing tags.

Product roadmap labels (for example `Epic 11.5`) are not package semver tags. Do not convert an epic label into `v<epic-id>` unless the plan explicitly states that the epic label is the intended package semver lane and package metadata/changelog agree.

## Preflight checklist

Check and record in the deployment doc:

```md
## Release Lane Semantics Preflight

| Check | Evidence | Verdict |
|---|---|---|
| Product epic label identified | <Epic label or none> | PASS/FAIL |
| Current package semver identified | <file + version or none> | PASS/FAIL |
| Plan intended package target identified | <target/no bump/hold/push-without-tag> | PASS/FAIL |
| Changelog/package metadata agree | <paths + versions or none> | PASS/FAIL |
| Intended G4 tag lane agree | <tag/no-tag> | PASS/FAIL |
| Epic label treated as semver only if explicit | <quote/evidence> | PASS/FAIL |
```

## Block/warn behavior

If plan target version, package metadata, changelog, and intended tag lane disagree:

1. Do not invent a tag from the epic label.
2. Do not ask an ambiguous G4 prompt.
3. Route to user/orchestrator with an explicit decision gate:

```text
Release lane mismatch detected:
- Product epic label: <...>
- Package metadata: <...>
- Changelog/release docs: <...>
- Intended tag lane: <...>

Choose:
A) Rebaseline to current package semver lane
B) Bump package/changelog and tag this release
C) Hold release/tag until lane is corrected
D) Push without tag
```

Proceed only after the decision is recorded in the deployment doc.

## Anti-pattern

Forge.ng Plan 018 had roadmap target `v11.5.0` while package metadata remained `0.42.2`; the user chose push, but the mismatch caused QA/DevOps ambiguity. This rule prevents DevOps from treating `v<epic-id>` as a release target by default.
