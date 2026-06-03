# Release-Prep Typecheck Preflight (PROC-NEW-5)

## Rule
Before opening release-prep QA/UAT chain, run workspace preflight typecheck.

## Trigger
Apply when either condition true:
- plan uses high-risk-release profile, or
- handoff marked release-prep.

## Command
- detected package-manager equivalent for root/workspace typecheck, e.g. `pnpm run typecheck` or `npm run typecheck`

## Enforcement
If typecheck fails, stop handoff. Fix or escalate. Do not open QA/UAT chain until pass evidence recorded.
