# Rule: Pre-Collect Test Output Before pidex-qa Invocation

PROC-NEW-36e / PROC-NEW-49-1 | pidex-qa

## Rule

On projects where the test suite has more than 1000 tests, the orchestrator MUST pre-collect
vitest run output and provide it in the pidex-qa briefing. The QA agent MUST NOT run the test
suite internally on such projects.

> **Threshold raised from 100 → 1000 (PROC-NEW-49-1, 2026-04-28).**
> Plan 40 (1242 tests) and Plan 49 (1413 tests) both caused pidex-qa to exceed 1 hour and be
> killed. The original 100-test threshold was not acting as a practical trigger because the
> number alone did not communicate urgency. The 1000-test threshold matches real-world suite
> sizes on this project where the stall is guaranteed, not just likely.

Threshold check (for orchestrator; use detected package-manager equivalent per [Package Manager Equivalence](../shared/package-manager-equivalence.md)):
  pnpm exec vitest run --reporter=verbose 2>&1 | tee /tmp/vitest-output.txt
  # or npm compatibility path: npm exec -- vitest run --reporter=verbose 2>&1 | tee /tmp/vitest-output.txt
  wc -l /tmp/vitest-output.txt   (>~3000 lines = likely >1000 tests)

  Quick count alternative (faster, no test run needed):
  find . -name "*.test.*" -not -path "*/node_modules/*" | xargs grep -l "it\|test\|describe" | wc -l
  (heuristic — any value >200 files implies >1000 tests on this project)

Briefing format (orchestrator provides to pidex-qa):
  Test output pre-collected (do NOT re-run tests):
  <full vitest run output>

## Why this matters

On projects with >1000 tests, running vitest internally consumes the entire tool budget
(shell command execution, output parsing, waiting for results) before document writing can
complete. The agent is killed by the timeout, not by running out of turns.

The QA stall pattern:
1. Agent writes doc skeleton (~5 tool_uses)
2. Agent runs vitest internally (~8-15 tool_uses + >60 min wall-clock for large suites)
3. Agent is killed by timeout before filling doc sections
4. Orchestrator must re-spawn — but now also must pre-collect test output

Pre-collected output eliminates step 2 entirely. The second invocation pattern is predictable
and preventable.

## QA agent self-check

If the orchestrator did NOT provide pre-collected test output AND the project appears to have
>1000 tests (check: find . -name "*.test.*" -not -path "*/node_modules/*" | wc -l > 200),
emit a briefing request before proceeding:

  ORCHESTRATOR: This project has >1000 tests and no pre-collected test output was provided.
  Please run vitest run and provide output before this QA invocation proceeds,
  or confirm test count is <1000 so I can run tests internally.

## Relationship to Rule 9b

This rule makes explicit what Rule 9b implies. Rule 9b states orchestrator SHOULD pre-create
output skeletons. This rule adds: orchestrator MUST pre-collect test output when project test
count exceeds 1000. The two rules are complementary.

## Order of operations — CRITICAL

The self-check MUST happen BEFORE any test execution command is issued.

Correct sequence:
1. Read briefing (is pre-collected output present?)
2. If YES: use provided output; skip internal test run
3. If NO and project has >100 tests: emit the briefing request BEFORE running tests
4. If NO and project has <100 tests: run tests internally

WRONG: run tests first, then check if output was provided — budget already consumed.

## Plan 40 confirmation (2026-04-26)

pidex-qa stalled post-run for a second time on this project (1242 tests). The rule was written
after Plan 36; the stall recurred in Plan 40. Root cause: either the rule index was not
read before test execution, or the self-check ran after the tests were already running.

The self-check must be the FIRST action after reading the plan doc, before any Bash tool call.

## Plan 49 confirmation — threshold raised (2026-04-28)

pidex-qa exceeded 1 hour and was killed on this project (1413 tests). The orchestrator had not
pre-collected vitest output, causing pidex-qa to run the full suite internally. Root cause:
the ">100 test" threshold did not communicate the severity of the failure mode clearly enough
to prompt orchestrator action. Threshold raised to 1000 (PROC-NEW-49-1).

## Empirical basis

Plan 36 (chat-llm-wiring, 2026-04-25): First pidex-qa invocation exhausted budget after writing
the document skeleton. 1202 tests in the project. Second invocation with pre-collected results
completed the full QA doc cleanly. Pattern also observed in Plans 25, 32, 40, and 49.
>1000 tests is the threshold where this consistently causes timeout-kills, not just stalls.
