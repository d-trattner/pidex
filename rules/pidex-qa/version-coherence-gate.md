# Version Coherence Gate (PROC-NEW-1)

Before assigning final status `QA Complete`, verify release/version identifiers coherent across touched artifacts.

## Required checks

1. Identify planned target version from plan frontmatter/summary.
2. Verify same version in modified release artifacts (example: `package.json`, `CHANGELOG.md`, release/deployment docs, roadmap entries if touched).
3. If environment installs deps during validation, verify installed version matches plan spec; record divergence.
4. Record explicit pass/fail evidence in QA doc before final status.

## Fail condition

If any version mismatch unresolved, do not set `QA Complete`. Mark `QA Failed` with mismatch list and handoff.
