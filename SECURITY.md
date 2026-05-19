# Security Policy

PIDEX is experimental local automation software for Pi. Treat it as operator tooling, not a sandbox.

## Supported versions

Only the current `master` / latest tagged release is maintained during early `0.x` development.

## Credentials

Do not commit provider credentials, API keys, tokens, `.env*`, `config.env`, private keys, certificates, runtime `state/**`, or generated `agents.output/**` artifacts.

PIDEX expects provider credentials to be managed by the user's local Pi/Codex/provider setup.

## Global Git hook

PIDEX can optionally install a global Git hook by changing the current Linux user's `core.hooksPath`. This is opt-in during interactive install and skipped in non-interactive installs unless `PIDEX_INSTALL_GLOBAL_GIT_HOOK=1` is set.

## Reporting vulnerabilities

For now, report issues privately to the repository owner or open a GitHub security advisory once the public repository exists. Do not include live secrets in reports.
