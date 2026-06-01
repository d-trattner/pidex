# No Immortal QA Test Servers

**ID:** QA-NO-IMMORTAL-SERVERS  
**Owner:** pidex-qa  
**Status:** active  
**Created:** 2026-06-01  
**Source:** Highest scenario QA incident (`highest-roadmap-and-feature-evolution`)

## Rule

`pidex-qa` must not create or launch local test servers that can outlive the QA command without an explicit lifecycle supervisor.

Any QA-started server/process must have:

1. captured PID or process handle;
2. bounded runtime (`timeout` or equivalent);
3. readiness check before tests depend on it;
4. cleanup registered before/at launch (`trap cleanup EXIT INT TERM` or equivalent);
5. post-run verification or explicit note that cleanup succeeded/failed.

## Forbidden pattern

Do not launch QA helper servers that intentionally never terminate unless a parent wrapper guarantees bounded cleanup:

```js
await new Promise(() => {});
setInterval(() => {}, 1000);
```

These patterns are allowed only inside a process managed by a bounded parent that records and kills the process.

## Required evidence

Before QA can close, the QA report must include one of:

- server lifecycle evidence: PID/port, readiness result, cleanup result; or
- `SERVER-LIFECYCLE-N/A` with reason no QA server was started.

If a QA-owned server cannot be cleaned up, QA must report `BLOCKED_INFRA` or `FAILED_INFRA`, not feature failure and not clean QA success.

## Safe shell pattern

```bash
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

timeout 60 node server.js &
SERVER_PID=$!
# readiness loop here
timeout 90 npm run smoke
```
