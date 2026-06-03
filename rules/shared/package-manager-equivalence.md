# Package Manager Equivalence

PROC-PACKAGE-MANAGER-1

## Rule

For JavaScript/TypeScript project work, do not hardcode npm commands unless the target project is detected as npm or explicitly documented as npm-only.

Use the package-manager detector/command builder when available:

```bash
node scripts/package-manager/detect.mjs --project "$PROJECT" --mode existing --json
node scripts/package-manager/commands.mjs --project "$PROJECT" --operation <operation> --json
```

## PIDEX package-manager policy

- PIDEX native/default package manager: pnpm.
- Existing npm target projects: compatibility path; keep `package-lock.json` unless migration is explicitly requested.
- New PIDEX-generated JS/TS projects: default pnpm.
- Yarn/bun: unsupported for execution in this initiative; detect and stop safely rather than guessing commands.

## Command equivalence

| Operation | pnpm | npm compatibility |
|---|---|---|
| Frozen install | `pnpm install --frozen-lockfile` | `npm ci` |
| Frozen install, scripts disabled | `pnpm install --frozen-lockfile --ignore-scripts` | `npm ci --ignore-scripts` |
| Run script | `pnpm run <script>` | `npm run <script>` |
| Exec local bin | `pnpm exec <bin>` | `npm exec -- <bin>` |
| Moderate audit | `pnpm audit --audit-level moderate` | `npm audit --audit-level=moderate` |

## Lockfile discipline

- pnpm project: update `pnpm-lock.yaml` only.
- npm compatibility project: update `package-lock.json` only.
- Do not create/replace lockfile type unless package-manager migration is explicitly requested.
- Mixed same-root `package-lock.json` + `pnpm-lock.yaml` requires an explicit migration note or must be treated as a failure.

## Auto-download guard

Avoid `npx`/`pnpm dlx` auto-downloads in QA, security, and code-review evidence by default. Prefer project-local execution:

```bash
pnpm exec <tool>
npm exec -- <tool>
```

If the tool is not installed/configured in the project, report `tool-not-configured` or an infra skip rather than silently downloading new code.

## Evidence requirement

Planner/implementer/QA/security/devops artifacts that run JS/TS dependency, test, audit, or tool commands should record:

- detected package manager;
- support status (`supported`, `compatibility`, `unsupported`, `unknown`, `conflict`);
- command equivalence used;
- lockfile touched/created, if any.
