# Rule: Seed Data as Explicit Plan Prerequisite

PROC-NEW-034-3 | pidex-planner

## Trigger

Any plan where verification requires traversing multi-step navigation (e.g., Ticket → Interview, Pipeline entry → sub-step) and the steps depend on an existing data entry.

## Rule

Plans with multi-step navigation verification must declare seed data as an explicit prerequisite in the plan — not an afterthought discovered during fix rounds.

## Required plan section

Under `## Prerequisites` or as named S0 sub-task:

```
## Data Prerequisites

| Requirement | Seed script | Idempotent? | Verification path |
|-------------|-------------|-------------|-------------------|
| <entity> with <fields> | <script name / npm command> | yes/no | <route + step> |
```

- Seed script must be idempotent (safe to re-run; does not duplicate entries)
- Plan must name the exact navigation path to verify the multi-step feature
- If no seed script exists, creation of one is a named plan task (not implicit)

## Invalid plan patterns

- "Verify step navigation" with no test data requirement
- Assumes a test entry already exists without declaring where it comes from
- Data dependency discovered during G9 fix round

## Failure mode prevented

Plan 034: Step navigation (Ticket → Interview) could not be verified in R1/R2 because no seed data existed. Seed script was created in R3 (fix round). Data dependency as plan prerequisite would have made R1 verification complete.
