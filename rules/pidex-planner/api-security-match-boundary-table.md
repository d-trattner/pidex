# Rule: API Security Match Boundary Table

PROC-NEW-7-1 | pidex-planner

## Trigger
Plan profile is `api-security` or plan changes API route matching, routing guards, or matcher-based security branches.

## Rule
Before critic handoff, planner MUST include an API-matcher boundary table and bind branch-differentiated security actions.

## Required table fields
- Route/matcher expression (exact value)
- Non-match class (eg: `prefix-only`, `suffix-only`, `substring-overlap`, `regex-escape`, `exact-miss`)
- Expected next action (`ALLOW`, `DENY`, `RETRY`, `ESCALATE`)
- Blocker category (`BLOCKER`, `NON_BLOCKER`, `RECONSIDER`)
- Evidence reference (`AC`/`NEG` identifier)

## Required checks
- Include at least one negative matrix row for each family above.
- Include collision examples for boundary overlap (`prefix`, `suffix`, `substring`) with category/action differentiation.
- Include one `AC` row and one `NEG` row that cite this table.

## Fail condition
Missing table, missing non-match branches, or missing evidence references in AC/NEG rows => plan INVALID before critic handoff.

## Evidence requirement
Implementation artifact must cite this rule and include table reference in handoff packet.
