# Provider-limits native roadmap record

Plan ID: 4  |  UUID: 70d50d80  |  Target release: v0.1.0  |  Lane: epic-lane

## Completion snapshot
- Probe/API/UI now PIDEX-native: `state/provider-limits/latest.json` drives API and `/limits` rows.
- Security hardening finalized: loopback default + public-bind token controls.
- Dependency cleanup completed: `@tanstack/react-start` dependency set to `1.167.65` (dependency issue resolved).
- G9 user preview approved with desktop and mobile `/limits` evidence showing `codex` + `codex-spark` rows and no recommendation UI.
- Devops hold status: `HELD` (local stage only, no push/tag/release).

## Backlog / follow-up items
1. QA status reconciliation lint
   - Problem: QA frontmatter token can remain `QA Blocked` while evidence indicates completion.
   - Outcome goal: auto-flag and normalize QA status before final handoff.
   - Suggested owner: pidex-devops.

2. Fixture-backed native-record assertions in planning acceptance
   - Problem: earlier loop missed native source coverage, caused rework.
   - Outcome goal: fixed acceptance template requiring `codex` + `codex-spark` assertions before handoff.
   - Suggested owner: pidex-planner.

3. Route-security matrix before code-review
   - Problem: token/bind/loopback edge cases were fixed late in review cycles.
   - Outcome goal: mandate pre-review negative tests for spoofed Host, non-loopback write, public-bind matrix.
   - Suggested owner: pidex-implementer + pidex-security.

4. Route-protection matrix for API/profile mutation endpoints
   - Problem: test gaps on bind mode, origin, and route families.
   - Outcome goal: standard matrix across exposed routes for read/mutate endpoints.
   - Suggested owner: pidex-security.

5. Temp QA dependency hygiene
   - Problem: temporary Playwright/dependency artifacts left in repo noise.
   - Outcome goal: isolate or document temporary QA tooling; remove transient lockfile churn from core evidence scope.
   - Suggested owner: pidex-devops/pidex-architect.

6. Lockfile advisory cadence
   - Problem: repeated dependency drift/advisory handling.
   - Outcome goal: recurring lockfile refresh + advisory watch checklist.
   - Suggested owner: pidex-roadmap/planner.
