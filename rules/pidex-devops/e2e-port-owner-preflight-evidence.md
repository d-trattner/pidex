# Rule: E2E Port-Owner Preflight Evidence

PROC-NEW-026-2 | pidex-devops

## Rule

Before any e2e gate run that requires fixed local port (example 3010), devops must run port-owner preflight and log evidence in deployment doc.

Required steps:
1. Detect current owner (`lsof -i :<port>` or equivalent).
2. If owner exists and is not expected test server, stop owner process.
3. Re-check port is free or owned by expected process.
4. Record result line in deployment doc before e2e execution.

## Required deployment evidence line

`E2E preflight port-owner: port <port> owner <before> -> <after>; status PASS|FAIL`.

## Trigger

Apply for every release-validation/e2e run using deterministic local port binding.

## Blocking rule

Do not run e2e gate without recorded preflight evidence line.

## Empirical basis

Plan 026 v0.25.1 retro finding #4: e2e gate blocked by unexpected existing process on port 3010.