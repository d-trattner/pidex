# Version Coherence Gate (PROC-NEW-1)

At QA start (Phase 2 step 2/3), run version/artifact coherence gate before deep test execution. Re-check before final `QA Complete`.

## Required checks

1. Identify planned target version from plan frontmatter/summary.
2. Verify same version in modified release artifacts (example: `package.json`, `CHANGELOG.md`, release/deployment docs, roadmap entries if touched).
3. Record `Version Coherence Gate: PASS|FAIL` token in QA doc at QA start.
4. If environment installs deps during validation, verify installed version matches plan spec; record divergence.
5. Before final status, confirm no version artifact changed since start-gate pass; if changed, re-run gate.

## Fail condition

If any version mismatch unresolved, do not set `QA Complete`. Mark `QA Failed` with mismatch list and handoff.
