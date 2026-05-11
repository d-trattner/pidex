# Rule: Playwright Smoke Baseline for "Shows Live Data" Assertions

PROC-NEW-45b | pidex-planner, pidex-qa

## Rule

Any V-matrix row (or AC row) that tests whether a **specific action caused data to
appear** (not merely that data is present) MUST specify a clean-baseline test protocol:

| Step | Requirement |
|------|-------------|
| Setup | Start from clean storage (clear localStorage, IndexedDB, or relevant fixture state) |
| Pre-trigger | Assert count = 0 (or list is empty) before the action |
| Action | Execute the triggering action (audit, form submit, API call, etc.) |
| Post-trigger | Assert count = N (or specific items are now visible) |

This applies to ANY V-row where:
- The Method column says "Playwright Browser-Level Smoke"
- The assertion tests data appearance caused by a user action (not static content)
- The component may receive data from a fixture or pre-populated cache

## How to specify in V-matrix

Add a "Baseline" sub-row or annotation to the V-matrix entry:

| V-13 | Agents sub-tab shows agent-filed items from a live audit | Browser | AC-7 |
| V-13-baseline | Start from clean storage; assert 0 agent items before audit trigger | Browser | AC-7 |

Alternatively, add a "clean baseline required" note in the Method column.

## Enforcement (pidex-qa)

When executing a V-row that asserts live data appearance:
1. Clear any pre-existing storage state before the test sequence
2. Verify count = 0 before triggering the action
3. Execute the action and wait for data to appear
4. Assert count = N (must be > 0)

If step 2 returns count > 0 (pre-existing fixture data), the test result is
inconclusive — stop, flag "baseline contaminated by fixture data", and report
to orchestrator.

## Relationship to existing rules

This rule specializes `playwright-smoke-ac.md` (PROC-NEW-UI-smoke), which governs
the obligation to have a Playwright AC row at all. That rule and this one are
complementary: playwright-smoke-ac.md = obligation to include a Playwright row;
live-data-smoke-baseline.md = how to structure that row when it asserts data
caused by an action.

## Anti-pattern

V-row passes because fixture items are already present in the component when
the browser opens — the action under test never caused the items to appear,
but the assertion cannot distinguish fixture from live data.

## Empirical basis

Plan 45 (audit-to-issue-pipeline, 2026-04-27): V-13 "Agents sub-tab shows
agent-filed items after audit" passed QA Browser Smoke. The Playwright
check observed items in the Agents tab (fixture data from networkFixture.items).
The audit pipeline was working correctly, but the Agents tab was reading from
fixture, not liveItems. Because no pre-trigger baseline was asserted, the
fixture items appeared as passing evidence. G9 revealed the bug. A clean-storage
baseline before the audit trigger would have returned count=0 before the audit
and count=0 after (since the data source was fixture), making the false positive
visible before push.
