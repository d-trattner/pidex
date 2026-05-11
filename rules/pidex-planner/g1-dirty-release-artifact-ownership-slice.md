# G1 Dirty Release-Artifact Ownership Slice

PROC-NEW: 027-PI-2

## Trigger
G1 intake detects dirty tree with release artifacts (roadmap, deployment, retro, PI, release docs, version/tag docs).

## Rule
Planner must add explicit plan slice covering:
1. Artifact owner (which role updates each dirty release artifact).
2. Commit slice strategy (which commit captures each artifact set).
3. Inclusion/exclusion rule for unrelated dirt.
4. Validation proof required before release decision.

## Minimum template
| Artifact | Owner role | Commit slice | Validation proof |
|---|---|---|---|
| `<path>` | `pidex-...` | `stage-1|stage-2|post-release` | `<command/evidence>` |

## Fail condition
If intake has dirty release artifacts and plan lacks ownership slice, do not route to implementation/critic.
