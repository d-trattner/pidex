# Rule: Adapter Lazy-Init Requirement

PROC-NEW-50-1 | pidex-planner

## Rule

When a plan introduces a new service adapter — any module that reads required env vars
to establish a client, connection, or configuration — the plan MUST include an explicit
requirement in the "Architecture Invariants" section:

  A-X — Lazy config loading: All config for [AdapterName] must be loaded lazily
  (on first use or via a getter), NOT at module load time. Eager loading at module
  scope causes dev server crashes when env vars are unset in development or test.

The plan must also specify failure behavior: does the adapter fail fast on first call
(preferred for required env vars), or does it have a fallback?

## Standard lazy pattern

  let _client: Client | null = null;
  function getClient(): Client {
    if (!_client) _client = createClient(loadConfig());
    return _client;
  }

## Trigger condition

Apply when the plan contains ALL of:
1. A new service adapter module (nginx-pm, pihole, unifi, etc.)
2. That adapter reads env vars to construct its client or connection string

## Why this matters

Plan 50 (execute-plan, 2026-04-29): loadNginxPMConfig() and loadPiholeConfig() were
called at module load time. Dev server crashed on startup when env vars were unset.
Fix (lazy getter functions) was discovered during live testing, not in any pipeline gate.
One architecture invariant row at plan time prevents this failure class.
