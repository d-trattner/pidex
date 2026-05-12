# Rule: Dashboard Route Parity Pre-Review Smoke

PROC-NEW-DASHBOARD-PARITY-SMOKE | pidex-implementer

## Rule

Before routing dashboard parity/API-query work to `pidex-code-reviewer`, implementer must run and document a route/API parity smoke matrix for every planned surface.

Apply when work includes any of:

- global project selector or URL query state;
- dashboard route parity with old dashboard;
- token weekly/monthly pagination;
- Live/Quality/Runs/Pipelines route filtering;
- route-wide query preservation.

## Required matrix

Implementation doc must include a table like:

| Surface | URL/API | Expected | Evidence |
|---|---|---|---|
| project selector | `/overview?project=<p>` | nav links preserve `project=<p>` | pass/fail |
| live filter | `/api/live?project=<p>` | data scoped to project | pass/fail |
| weekly tokens | `/api/token-consumption?granularity=week&page=0&page_week=0&project=<p>` | `weekly` metadata present | pass/fail |
| monthly tokens | `/api/token-consumption?granularity=month&page=0&page_month=0&project=<p>` | `monthly` metadata present | pass/fail |
| project switch reset | helper/test | clears `page`, `page_week`, `page_month` | pass/fail |

At minimum, include both weekly and monthly token paths and any route explicitly listed in plan scope.

## Required tests

If a helper controls URL state, add or update focused tests for:

- preserving unrelated query params;
- setting/clearing `project`;
- resetting route-specific pagination keys (`page`, `page_week`, `page_month`) on project change.

## Blocker

Do not request code review until the matrix is complete. If local DB lacks enough history to test older/newer states visually, document `DATA_LIMITED` and still prove API metadata shape.

## Why

Plan 4 dashboard parity reached code review missing monthly token UI and Live project filtering, then had a second rejection because project switch preserved token page offsets. A small route/API matrix would have caught all three before review.
