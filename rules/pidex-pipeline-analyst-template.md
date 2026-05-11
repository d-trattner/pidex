# pidex-pipeline-analyst Report Template

Use this template for advisory meta-analysis of completed Running Pi pipeline runs.

Before recommending a harness improvement, inspect the provided Running Pi implemented-context bundle. If a rule/helper already exists, do not recommend adding it as new; explain why the existing mechanism did not prevent the observed issue and propose a refinement, trigger change, timing change, or evidence improvement.

```md
# Pipeline Analysis

## Run Metadata
| Field | Value |
|---|---|
| Project | ... |
| Plan | ... |
| Outcome | complete/failed/held/rejected/unknown |
| Started | ... |
| Completed | ... |
| Agent count | ... |
| Gate count | ... |
| Rework loops | ... |

## Executive Summary
- 3-7 bullets.

## Pipeline Health Verdict
- Verdict: GREEN / YELLOW / RED
- Confidence: low / medium / high

## What Went Well
- ...

## Friction / Waste
| Finding | Evidence | Impact | Suggested action |
|---|---|---|---|

## User Intent / Product Fit
| Finding | Evidence | Severity | Suggested prevention |
|---|---|---|---|

## Agent Routing Assessment
| Stage | Assessment | Notes |
|---|---|---|

## Gate Timing Assessment
- Were gates too early/late?
- Was G9/user preview early enough?
- Was devops preview-before-G4 respected?

## Secondary Lane Assessment
- Useful findings?
- Noise?
- Malformed/routing issues?

## Existing Harness Coverage Check
| Issue | Existing mechanism found? | Why it was insufficient / not triggered | Refinement needed |
|---|---|---|---|

## Harness Improvement Candidates
| Candidate | Type | Priority | Scope | Risk |
|---|---|---|---|---|
| ... | refine-existing-rule/new-rule/eval/agent/tool/analytics | low/med/high | running-pi/project | ... |

## Do Not Change
- Things that looked useful and should not be over-tightened.

## Follow-up Recommendation
- no action / monitor for N more runs / create reminder / implement small rule / plan larger harness change

<!-- ROUTING
verdict: COMPLETE
route_to: user
reason: Advisory pipeline analysis complete
context_file: <this file>
-->
```
