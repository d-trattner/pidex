# Rule: Runtime Smoke Requirement

PROC-NEW (runtime-smoke) | pidex-qa

## Rule

For any plan changing **HTTP routes**, **build/packaging tooling**, **cwd semantics** (monorepo moves, workspace boundaries, `process.cwd()`-dependent code), or introducing a **new network-facing listener** (proxy, server, socket binding), pidex-qa MUST run a **Runtime Smoke Phase** in addition to standard test-suite.

Closes the "static checks green, runtime red" gap — all automated checks pass while user-visible routes still 500, 404, or crash.

## Mandatory scope table

| Plan touches... | Runtime Smoke Phase required? |
|-----------------|-------------------------------|
| HTTP routes (new, modified, removed) | YES |
| Build tooling, bundler config, workspace manifests, package.json scripts | YES |
| cwd-dependent code, monorepo extraction, `process.cwd()` / `__dirname` callers | YES |
| Network-facing listeners (proxy, socket, SSE, WS) | YES |
| Path resolution (config files, assets, fixtures loaded at runtime) | YES |
| Pure refactor inside pure module, no runtime surface change | NO |
| Docs-only / CHANGELOG-only | NO |
| Test-only changes | NO |

## Required steps

1. Boot dev server in background, capture PID
2. Wait for ready-signal (poll root URL, 60s timeout)
3. curl each V-matrix row representing user-visible behavior
4. Exercise representative real data, not only happy-path fixtures
5. Kill dev server cleanly
6. Record "Runtime Smoke Verification" section in QA doc

**If dev server requires >60s to boot**: flag REQUIRES ARCHITECT.

## Proxy-path coverage

When app served via reverse proxy, smoke tests MUST check proxy-facing URL, not only upstream port. Confirm HTML response includes asset paths with expected prefix.

## Empirical basis

Plan 15: v0.7.0 Date-render crash masked by cwd-relative `storage.readPage` bug 8+ days. Bug reached Preview Gate because no earlier check exercised real content through moved code.
