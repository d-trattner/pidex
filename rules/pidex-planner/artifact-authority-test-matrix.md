# Rule: Artifact Authority Test Matrix for Resolver/Path Plans

PROC-NEW-1 | pidex-planner

## Trigger
Plan touches resolver/path authority, cwd/path resolution, artifact-root ownership.

## Requirement
Plan must include explicit authority test matrix:
- runtime authority root (repo root fixed)
- test override API/path (`setArtifactResolverTestRoot()` or equivalent)
- fixture isolation proof (temp root, no runtime artifact pollution)
- validation rows for targeted + full-suite evidence

## Fail condition
Missing matrix => plan incomplete. Do not route to pidex-critic.
