# Browser Smoke Preflight and Resource Runaway Kill Switch — Caveat Analysis

Date: 2026-06-01
Context: Highest scenario QA incident in `/tmp/pidex-highest-scenario/project`.

## Scope

Rules already adopted from the incident:

- `rules/pidex-qa/no-immortal-test-servers.md`
- `rules/pidex-qa/generated-script-syntax-check.md`

This note analyzes the two rule candidates not yet adopted:

- `pidex-qa-browser-smoke-preflight`
- `orchestrator-resource-runaway-kill-switch`

## Candidate 3: PIDEX QA browser smoke preflight

### Value

A browser preflight would have caught or classified the Playwright/Chromium problem before QA entered retry/server-generation loops. It would also keep browser smoke optional and explicit instead of turning every UI QA into a surprise browser install.

### Caveats / possible unwanted outcomes

1. **False downgrade of real UI regressions**
   - If preflight is too permissive, agents may label browser failures as `SKIP_NOT_INSTALLED` or `BLOCKED_INFRA` even when browser evidence is required to catch hydration/style/interaction bugs.
   - Mitigation: require the plan/critic/code-review to mark whether browser smoke is mandatory, preferred, or optional. If mandatory and infra is missing, verdict should be `BLOCKED_INFRA`, not `APPROVED`.

2. **Dependency drift between project and PIDEX host**
   - Browser tests can run using project-local `@playwright/test`, global Playwright, or PIDEX-home tools. Mixing these can create version/browser-cache mismatches.
   - Mitigation: preflight must record source: `project-local`, `pidex-home`, `global`, or `not-found`; prefer project-local when available.

3. **Large downloads hidden behind “preflight”**
   - A preflight that auto-installs browsers recreates the surprise-download problem under a nicer name.
   - Mitigation: preflight is read-only by default. Install requires explicit `BROWSER_INSTALL_OK=1`, a timeout, and evidence.

4. **Remote/CI platform fragility**
   - Browser executables may exist but crash due to missing libraries, sandbox limits, GPU/headless instability, or low shared memory. The highest scenario hit Chromium `SIGSEGV` after executable discovery.
   - Mitigation: preflight must include a bounded launch probe, not just file existence.

5. **Overhead on non-UI tasks**
   - Running browser preflight for every QA slice wastes time.
   - Mitigation: trigger only when touched files/plan indicate UI/browser behavior, or when a rule explicitly requires browser proof.

6. **Ambiguous status taxonomy**
   - `SKIP`, `BLOCKED`, `NOT_CONFIGURED`, and `FAILED_INFRA` can blur. This can pollute dashboard metrics.
   - Mitigation: define canonical tokens:
     - `BROWSER-SMOKE-PASS`
     - `BROWSER-SMOKE-SKIP-NOT-REQUIRED`
     - `BROWSER-SMOKE-SKIP-NOT-CONFIGURED`
     - `BROWSER-SMOKE-BLOCKED-INFRA`
     - `BROWSER-SMOKE-FAILED-FEATURE`

### Adoption recommendation

Do not adopt as a hard rule yet. First design a short status taxonomy and evidence format. Then adopt as a QA rule that is conditional on UI/browser relevance and read-only by default.

## Candidate 4: Orchestrator resource runaway kill switch

### Value

A kill switch gives the operator/orchestrator a deterministic way to stop a specialist stage that is consuming CPU/processes without useful progress, while preserving artifacts and cleaning disposable auth.

### Caveats / possible unwanted outcomes

1. **Killing legitimate long-running work**
   - Some builds, audits, browser installs, or model calls can legitimately run longer than a simple threshold.
   - Mitigation: use stage-specific budgets and heartbeat/progress checks rather than one global timeout.

2. **Process ownership ambiguity**
   - `pkill -f` can kill unrelated processes if patterns are broad, especially on shared remote hosts.
   - Mitigation: prefer process groups, PID files, tmux session names, workspace path matching, and allowlisted kill patterns.

3. **Artifact loss before diagnosis**
   - Killing immediately can erase logs or leave no explanation for why the stage stopped.
   - Mitigation: capture pane/log/process tree before termination where possible; if SSH is overloaded, allow emergency kill then postmortem note.

4. **Security/auth cleanup races**
   - Removing disposable auth while a still-running agent is active may cause confusing secondary failures; not removing it is worse after abort.
   - Mitigation: kill session/process group first, then remove auth, then verify removal.

5. **Incorrect blame classification**
   - A runaway may be caused by feature code (infinite loop) or infra/tooling (browser install/orphan server). A kill switch could mark all as infra and hide real defects.
   - Mitigation: require `ABORTED_RESOURCE` plus a cause field: `suspected_feature`, `suspected_tooling`, `unknown`. Do not auto-approve after kill.

6. **Nested agent/child process complexity**
   - PIDEX agents may spawn child shells, node servers, browsers, package managers, and model CLI delegates. Killing only tmux may leave children under PID 1.
   - Mitigation: use process-group launch where possible; collect `ps --forest`/`pgrep -af <workspace>` and kill workspace-scoped descendants.

7. **Operator trust and accidental destructive cleanup**
   - A broad cleanup script could delete useful evidence or non-disposable files.
   - Mitigation: kill switch should default to process cleanup and auth removal only; artifact deletion must be separate and opt-in.

### Adoption recommendation

Keep as design candidate for now. It needs an implementation plan, probably combining:

- an orchestrator rule;
- a small `scripts/quality/abort-runaway.*` or module helper;
- a process ownership convention for specialist stages;
- dashboard/report taxonomy for `ABORTED_RESOURCE` / `BLOCKED_INFRA`.

## Near-term practical policy

Until Candidate 3 and 4 are implemented:

- QA browser attempts must be manually bounded with `timeout` and cleanup.
- Browser smoke can be accepted as `BLOCKED_INFRA` only when deterministic non-browser acceptance evidence is strong and the plan does not make browser proof mandatory.
- Remote disposable auth must be re-checked after any aborted stage.
- Any repeated resource runaway should stop the scenario and open an infra/rule-design task before continuing.
