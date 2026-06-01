# Browser Smoke System Deps Disclosure Update

Date: 2026-06-01

## Summary

Added explicit disclosure and installer support for Linux Chromium system dependencies.

## Changes

- `browser-smoke.install --with-system-deps` now warns that it installs host-level Linux packages via Playwright `install-deps chromium`, requires root/passwordless sudo, and may modify apt packages.
- `install.sh` adds:
  - `--with-browser-smoke-system-deps`
  - `--skip-browser-smoke-system-deps`
  - matching env controls.
- Interactive Linux install now asks a second explicit question before installing system dependencies.
- `README.md` documents browser-smoke install modes and root/sudo/system package implications.
- `modules/pidex/browser-smoke/README.md` documents system dependency behavior and commands.
- `scripts/modules/reference-guard.mjs` excludes `agents.output/` generated artifacts from hard-coded module path enforcement.

## Validation

```bash
bash -n install.sh
node --check modules/pidex/browser-smoke/scripts/browser-smoke/install.mjs
npm run modules:validate
node scripts/modules/reference-guard.mjs --mode fail --pidex-root "$PWD"
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --dry-run --yes --with-system-deps
./install.sh --dry-run --with-browser-smoke --with-browser-smoke-system-deps
```

Results: PASS. Reference guard reported only known legacy fixed-core warnings and zero forbidden module path files.
