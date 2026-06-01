# Browser Smoke QA Substrate — Linux Remote Smoke

Date: 2026-06-01
Remote: `root@10.0.0.107`
Workspace: `/tmp/pidex-browser-smoke-linux`

## Scope

Manual remote smoke of initiative 024 browser-smoke MVP without running full standard pipeline and without downloading browser binaries.

## Transfer

Copied current local worktree to remote temp workspace via tar, excluding `.git`, `node_modules`, `state`, dashboard build/data, and `.cache`.

## Commands

```bash
cd /tmp/pidex-browser-smoke-linux
bash -n install.sh
node modules/pidex/browser-smoke/scripts/browser-smoke/status.tdd.test.mjs
npm run modules:validate
node scripts/modules/run-check.mjs --capability browser-smoke.preflight --agent orchestrator --phase maintenance --project "$PWD" -- --json --no-launch
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --dry-run --yes
node scripts/modules/run-check.mjs --capability browser-smoke.cleanup-check --agent orchestrator --phase maintenance --project "$PWD" -- --json
```

## Results

- `bash -n install.sh`: PASS
- status contract test: PASS
- `npm run modules:validate`: PASS
- `browser-smoke.preflight --json --no-launch`: PASS with `BROWSER-SMOKE-SKIP-NOT-CONFIGURED`
- `browser-smoke.install --dry-run --yes`: PASS, printed PIDEX-local install commands only; no download performed
- `browser-smoke.cleanup-check --json`: PASS with `BROWSER-SMOKE-PASS`, no browser-smoke processes detected

## Notes

This validates Linux structural/module/no-surprise behavior. It does not validate actual Chromium install/launch. That remains an explicit opt-in test because it downloads a large browser binary.
