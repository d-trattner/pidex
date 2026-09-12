# Decision-oriented status

`pidex-decision-status-v1` is a **presentation contract**, not a new authority or dispatch permission. It projects the existing runtime/baseline observation consistently for Pi, CLI and dashboard. It does not accept a baseline, migrate receipts, change review budgets or infer success from logs.

## Read it

- In Pi: `/pdstatus` observes that Pi process. The current command's default scope is explicitly **host-direct**, not an inferred project mode or universal acceptance.
- CLI: `node scripts/runtime/status.mjs --pidex-root /absolute/pidex --json` adds `decision` to the existing JSON. Text output uses the same decision labels. Existing machine status/binding/`can_dispatch` fields retain their dispatch semantics; `next_action` follows the common recommendation.
- Dashboard Overview and Dashboard pages: **Status lesen** requests a fresh bounded observation of the configured dashboard-host runtime. It does not observe the selected project's execution or a Pi session. The existing `/api/summary?view=decision-status` handler bypasses DB refresh/query work and returns only the allowlisted decision DTO, not paths, environment, complete configuration or raw errors.

The dashboard query is manual, not five-second polling. Its timestamp is an observation time, not a continuous readiness guarantee. While refreshing or after an error, the previous response is not displayed as current evidence. No acceptance, installation, resume, cleanup or kill action is exposed by the card.

## Separate questions

| Question | Meaning |
|---|---|
| Source | Observed checkout/configuration coverage; modified or incomplete remains visible. |
| Validated | A bound baseline matches the current source/configuration and the explicitly observed scope. A selected baseline alone is insufficient. |
| Loaded | A controlled Pi-process start versus a weaker observation at load time. A historical start may remain visible alongside later drift. CLI/dashboard never attest another process. |
| Installed | Unknown unless an installation/deployment contract exists. This first slice has no such producer and always says not proven. Neither clean Git nor a running process substitutes for it. |
| Ready | Only a currently matching, controlled Pi process in its accepted scope. Legacy/unbound `can_dispatch: true` must never be displayed as operational acceptance. |
| Project done | Not assessed by runtime status. Project completion still requires its pipeline/review/closeout evidence. |

The source commit and **confirmed loaded commit** are separate fields. An unconfirmed load-time source snapshot is never promoted to a confirmed loaded commit; CLI/dashboard leave that field unknown. Matching commit names alone do not replace source/configuration inventory checks.

A recommendation identifies the next decision: inspect corrupt/locked evidence, inspect source/configuration drift, check scope acceptance, inspect an unbound candidate, or confirm the actual Pi process. These are guidance only. Never delete unknown locks, invent evidence, reset identities or initiate paid work merely to make a status green.

## Historical pipeline counters

Summary counters now use explicit `pipeline_started` and terminal events grouped by project identity, path, plan and pipeline ID. They no longer infer completion from DevOps/PI/roadmap calls, `route_to: user` or an agent's `COMPLETE` verdict.

A recorded success requires an opening, one distinct opening timestamp, one terminal kind/time, a noncontradictory completion status, valid timestamps and no later event. Identical imported copies do not inflate the count. Missing openings, multiple contradictory terminals and malformed ordering do not count as success. No legacy-agent fallback manufactures a completed pipeline.

The API labels this basis `recorded_pipeline_events`; the two summary views do not label older/unmarked data as event-based success. This remains an imported historical read model, **not a fresh canonical closeout check**, and it does not reinterpret old journals or prove task correctness/installation/readiness. Other historical list views retain their existing provenance and are not upgraded into authority by this change.

No provider-limit records now means `unknown` in the dashboard overview, not `safe`. This is not a new quota probe or a comprehensive freshness contract for provider data.

## Implementation and validation boundary

Point4 was initially delivered with validation deferred. Validation is a separate phase and evidence belongs to its exact source candidate, not automatically to a later commit. No test/build/browser/server run is implied by documentation or a status read. Existing operational/platform acceptance limits and the prohibition on automatic paid test series remain separate decisions.

Local checks include the runtime/server/SQL tests in `pnpm check`, dashboard `typecheck` and `build`, and an explicit real-browser card fixture:

```sh
PIDEX_BROWSER_EXECUTABLE=/absolute/existing/chromium corepack pnpm --dir dashboard test:decision-browser
```

The browser fixture requires an already installed local executable; it never downloads one. It uses a disposable Chromium profile and loopback-only Vite fixture with synthetic responses, no application DB or provider calls. It checks manual fetch, stale-data hiding during refresh/failure, schema rejection, no automatic retry/focus/reconnect fetch, remount forgetting and mobile width. It is not a full deployed-dashboard or live-pipeline acceptance test.

Recovery's module-owned fingerprint inputs remain explicit via the stable module library, including both the descriptor and actual lifecycle implementation bytes. Refactoring the module boundary never permits old scope receipts to be adopted.
