# Contributing

PIDEX v0.1 expects the checkout at exactly `~/pidex` on Linux/WSL2, or `$HOME\pidex` when using the experimental Windows bootstrap.

Prerequisites: Git, Node.js compatible with Pi (`>=22.19.0` on Linux/WSL2; Windows bootstrap checks `>=22.12.0`), npm, and the Pi CLI (`npm install -g @earendil-works/pi-coding-agent`).

## Local checks

Run before commits and public pushes:

```bash
cd ~/pidex
npm run check
npm run public:check -- --dirty-ok
npm pack --dry-run --json
```

Use `npm run public:check` without `-- --dirty-ok` for release commits/tags.

## Generated artifacts

Do not commit generated/runtime material:

- `agents.output/**`
- `state/**`
- `pidex/state/**` except harmless placeholders such as `.gitkeep`
- dashboard data/databases
- `.env*`, `config.env`, secrets, keys, certs

## Public development content

These are intentional public PIDEX product/development surfaces after normal review:

- `agents/**`
- `rules/**`
- `prompts/**`
- `config/**`
- `skills/**`
- `extensions/**`
- `scripts/**`
- `templates/**`
- `pidex/context/**`
- `pidex/rules/**` when present

## Provider routing

Direct `pidex_agent` provider overrides support only `pi` and `codex`. Other authenticated provider/model IDs such as DeepSeek or Minimax should be routed through `provider=pi`.
