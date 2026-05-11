# Multi-Spawn Version Tag Strategy (PROC-NEW-39a)

**Applies to:** pidex-planner
**Load when:** writing a plan that is Spawn B (or any non-final Spawn) of a multi-spawn release, OR when the target release version was partially claimed by a prior Spawn A plan.

---

When a release version has multiple Spawns, the final semver tag for that version MUST NOT be pushed until ALL Spawns for that version are complete and committed.

## Required plan section

Any plan whose Epic annotation contains "Spawn B", "deferred-AC", or whose Target Release matches a version already partially committed by a prior plan MUST include a "Version Tag Strategy" section with one of these three explicit choices:

| Strategy | When to use | What to write |
|----------|-------------|---------------|
| **Hold** | Tag not yet pushed by any prior Spawn | "v<X.Y.Z> tag is held; pidex-devops Stage 2 will push it after this Spawn commits." |
| **Pre-release** | Spawn A pushed an intermediate tag | "Spawn A pushed `v<X.Y.Z>-spawn-a`; this Spawn supersedes it with `v<X.Y.Z>` final tag." |
| **Force-move** | Spawn A pushed the final tag prematurely | "v<X.Y.Z> was pushed by Spawn A at <hash>. Stage 2 MUST force-move the tag to HEAD after this Spawn commits. Document force-move procedure in the devops doc." |

## Why this matters

A version tag pushed before all Spawns complete points to a partial release. Any consumer of that tag (CI, deployment pipelines, changelog generators) sees an incomplete state. The force-move pattern works but is fragile — it requires out-of-band knowledge in the devops doc and fails silently if omitted.

## Anti-pattern to reject

A Spawn B plan that does NOT include a "Version Tag Strategy" section and whose target release was already partially tagged by a prior plan. pidex-critic should flag this as a structural gap if present.
