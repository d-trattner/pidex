# PIDEX Git Hooks

PIDEX can install one global Git hook path for the current Linux user:

```bash
<pidex-root>/scripts/git-hooks/install-global.sh
```

This sets:

```bash
git config --global core.hooksPath <pidex-root>/scripts/git-hooks/global
```

The previous global `core.hooksPath` is saved in:

```text
<pidex-root>/state/git-hooks/global-state.json
```

Previous hooks are not chained. They are restored on uninstall:

```bash
<pidex-root>/scripts/git-hooks/uninstall-global.sh
```

The pre-commit hook runs:

```text
<pidex-root>/scripts/git-hooks/lib/security-scan.sh --staged
```

It blocks dangerous credential files, key material, common provider tokens, credentialed connection strings, and high-confidence keyword-based secrets.
