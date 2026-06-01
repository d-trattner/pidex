# PIDEX Git Hooks

PIDEX can install one global Git hook path for the current Linux user:

```bash
node <pidex-root>/scripts/modules/run-check.mjs --capability git-security-hooks.install --agent pidex-devops --phase maintenance --project <pidex-root>
```

This sets:

```bash
git config --global core.hooksPath <pidex-root>/modules/pidex/git-security-hooks/scripts/global
```

The previous global `core.hooksPath` is saved in:

```text
<pidex-root>/state/git-hooks/global-state.json
```

Previous hooks are not chained. They are restored on uninstall:

```bash
node <pidex-root>/scripts/modules/run-check.mjs --capability git-security-hooks.uninstall --agent pidex-devops --phase maintenance --project <pidex-root>
```

The pre-commit hook runs:

```text
<pidex-root>/modules/pidex/git-security-hooks/scripts/lib/security-scan.sh --staged
```

It blocks dangerous credential files, key material, common provider tokens, credentialed connection strings, and high-confidence keyword-based secrets.
