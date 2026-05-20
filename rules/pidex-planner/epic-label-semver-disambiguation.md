# Rule: Epic Label vs Semver Disambiguation

PROC-NEW-SEMVER-1 | pidex-planner

## Trigger

Apply to every plan with any roadmap epic label, target release, version bump, changelog entry, package metadata change, tag, publish, push, or DevOps/G4 release path.

## Rule

Planner must distinguish product roadmap epic labels from package semver/tag lanes.

An epic label such as `Epic 11.5` is not a package version and must not imply tag `v11.5.0` unless the user or roadmap explicitly says that package semver should move to that lane.

## Required plan section

Add a compact section near the plan header:

```md
## Release Lane Semantics

| Field | Value |
|---|---|
| Product epic label | Epic <id/name> |
| Current package semver | v<X.Y.Z> from <package file or none> |
| Intended package target | v<X.Y.Z> | no version bump | hold | push-without-tag |
| Tag intended at G4? | yes/no |
| Changelog/package files in scope? | <paths or none> |
| Epic label implies semver? | yes/no, with rationale |
```

## Coherence requirements

- If `Epic <id>` and `v<X.Y.Z>` differ, explicitly say they are different taxonomies.
- If no package bump/tag is intended, state `Intended package target: no version bump` and `Tag intended at G4: no`.
- If package metadata/changelog/tag is intended, bind exact files and target semver.
- If roadmap target, package metadata, changelog, and intended tag lane disagree, do not hand off to critic/implementer until plan records a user decision: rebaseline to current semver lane, bump/tag, hold, or push without tag.

## Anti-pattern

Forge.ng Plan 018 used roadmap target `v11.5.0` while package metadata was `0.42.2`. The user chose push, but the mismatch caused QA/DevOps ambiguity. Future plans must make the release-lane semantics explicit before G4/DevOps.
