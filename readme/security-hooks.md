# Global Git Security Hook

PIDEX can install one global Git hook path for the current Linux user.

## Install

```bash
node <pidex-root>/scripts/modules/run-check.mjs --capability git-security-hooks.install --agent pidex-devops --phase maintenance --project <pidex-root>
```

This sets global `core.hooksPath` to PIDEX's module-owned git hook directory. The previous global `core.hooksPath` is saved under:

```text
<pidex-root>/state/git-hooks/global-state.json
```

Previous hooks are not chained or executed while PIDEX owns the global hook path.

## Uninstall / restore

```bash
node <pidex-root>/scripts/modules/run-check.mjs --capability git-security-hooks.uninstall --agent pidex-devops --phase maintenance --project <pidex-root>
```

If a previous global hook path existed, PIDEX restores it. If none existed, PIDEX unsets `core.hooksPath`.

## What the hook blocks

The pre-commit hook scans staged files and blocks:

- dangerous credential files such as `.env`, `.npmrc`, `.pypirc`, `.netrc`, Docker auth config, and `auth.json`
- key/certificate/keystore files such as `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`, `.kubeconfig`
- SSH private key filenames
- Terraform state
- common provider tokens for AWS, GCP, Azure, Stripe, GitHub, GitLab, Slack, Telegram, Discord, OpenAI, Anthropic, SendGrid, Twilio, DigitalOcean, Shopify, npm, PyPI, Cloudflare, and Google OAuth
- private key headers
- credentialed database/message-broker connection strings
- high-confidence keyword secrets such as passwords, API keys, access tokens, and Authorization headers

Docs/tests/fixtures skip the weakest keyword layer to reduce false positives, but still run high-confidence file, structural-token, and connection-string checks.

## Doctor check

```bash
<pidex-root>/scripts/doctor.sh
```

Doctor reports whether the global hook is active, executable, restorable, and whether scanner smoke tests pass.

## Bypass limitation

Git itself allows:

```bash
git commit --no-verify
```

which bypasses hooks. PIDEX's Pi extension blocks that flag inside Pi sessions, but a manual terminal outside Pi can still use it. Treat `--no-verify` as a manual break-glass action.
