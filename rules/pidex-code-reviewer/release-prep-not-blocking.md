# Rule: Release-Prep Artifacts Are Not Blocking Code-Review Findings

PROC-NEW-50-8 | pidex-code-reviewer

## Rule

Version bump updates (package.json version field) and CHANGELOG entries are release-prep
artifacts. When these are absent or incomplete during code review:

  CORRECT: Note as non-blocking reminder (n-level): "Release prep: version bump and
  CHANGELOG entry not yet present — expected before Stage 1 commit."

  INCORRECT: Flag as blocking M-level finding, requiring an implementation revision.

These artifacts are verified by pidex-devops Stage 1 pre-flight, which is the appropriate gate.

## Rationale

Code review's blocking findings (M-level) gate the pipeline by requiring a new implementation
revision. Release-prep artifacts (version bump, CHANGELOG) are mechanical deliverables with
no semantic content — their absence does not indicate a code quality issue. Including them in
the M-level blocking list:
1. Delays processing of semantically important findings (they all share the M-1 label)
2. Causes an extra implementation revision for what is a 2-line mechanical change
3. Conflates code quality with release checklist compliance

## Scope

This rule applies to:
- package.json version field changes
- CHANGELOG.md entries
- Any other release-logistics artifact (e.g., release notes, deploy config version strings)

This rule does NOT apply to:
- Semantic correctness of version numbers (e.g., "this is a breaking change, should be major bump" IS a valid code-review finding)
- Missing feature documentation in code comments or wiki (those are content, not release prep)

## Empirical basis

Plan 50 (execute-plan, 2026-04-29): Version bump and CHANGELOG appeared as blocking M-1 in
an early review pass. They were the only M-1 items in that pass, causing a revision cycle for
a 2-line mechanical change. Moving these to n-level reminders prevents this pattern.
