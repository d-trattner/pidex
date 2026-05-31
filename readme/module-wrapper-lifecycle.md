# PIDEX Module Wrapper Lifecycle

PIDEX keeps stable public paths while moving real implementations into first-party module folders.

## Wrapper classes

### Permanent public authority wrappers

Wrappers that are stable public/API authority and should normally remain forever.

Current permanent wrapper:

- `scripts/release/public-readiness.sh`

### Long-soak compatibility wrappers

Wrappers for documented/user-facing paths that may retire only after an explicit retirement proposal.

Examples:

- `scripts/release/public-readiness-check.mjs`
- `scripts/release/reference-integrity.mjs`
- migrated module command paths under `scripts/**`

### Internal compatibility wrappers

Wrappers used by PIDEX scripts/tests/docs during migration. They may retire after all references are updated and a release soak passes.

## Required parity matrix

Every moved executable path needs parity evidence:

| Old wrapper | Module implementation | Args | Exit code parity | Stdout parity | Stderr parity | Failure parity | Status |
|---|---|---|---|---|---|---|---|

Minimum parity cases:

- `--help` or equivalent;
- invalid argument failure;
- read-only/status success path;
- mutation dry-run path when available.

## Minimum soak before retirement

- Public authority wrappers: no automatic retirement.
- Long-soak wrappers: minimum two public releases or explicit operator approval.
- Internal wrappers: minimum one clean release/readiness cycle and dependency inventory proving no references remain.

## Retirement gate

Wrapper retirement requires:

1. dependency inventory says no active references remain;
2. docs/changelog mention removal or permanence decision;
3. critic review;
4. code review;
5. QA validation;
6. security review if command execution, auth, config, release, or write paths are involved;
7. remote clean smoke on the configured PIDEX test server;
8. explicit operator approval for public paths.

## Rollback rule

Any wrapper retirement or implementation movement must be reversible by restoring the wrapper to call the previous module implementation and rerunning:

```bash
npm run modules:test
npm run check
npm run modules:validate
npm run reference:check
bash scripts/release/public-readiness.sh --dirty-ok --skip-check
```
