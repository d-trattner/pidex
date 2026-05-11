# Monorepo Migration Pre-Checks

If plan involves **moving code between directory boundaries** — e.g. `app/` → `apps/<name>/`, `lib/` → `packages/<name>/`, extracting a workspace, consolidating into shared package, or any operation changing process runtime cwd relative to resolved paths — plan MUST include **pre-implementation audit milestone** enumerating and dispositioning every path-sensitive primitive in moved code.

**Mandatory audit steps (typically as Pre-M0 or part of first tracer-bullet milestone):**

1. **Grep moving code for each primitive** (extend list for project language — JS/TS starter set):
   - `process.cwd()`
   - `__dirname` (CJS) and `import.meta.dirname` / `import.meta.url` (ESM) — behave differently after move
   - `path.resolve(...)` / `path.join(...)` with relative-path first argument
   - `fs.readFileSync('./...')` / `fs.readFile('./...')` / `fs.readdirSync('./...')` and async variants
   - Relative-path entries in config files (`tsconfig.json` `paths`, `baseUrl`, `include`; `vite.config.*` `root`, `publicDir`, `resolve.alias`; `next.config.*`; `webpack.config.*` relative-root patterns)
   - Env-var files (`.env`, `.env.local`) referenced by relative path
   - Dynamic `import('./...')` or `require('./...')` with relative strings traversing moved-file's original tree
2. **For each found usage, document migration strategy** in plan BEFORE implementation. Valid strategies:
   - (a) Replace with `import.meta.dirname`-based / `__dirname`-based resolution that is cwd-invariant.
   - (b) Move resource **inside** the workspace being created so relative path still resolves.
   - (c) Pass resource root **explicitly** via env-var or config parameter at process boot.
   - (d) Document as deferred (e.g. "this `cwd()` call in legacy script is out of scope; tracked in open-items"), but ONLY if caller is provably outside moving tree.
3. **Each disposition must be explicit in plan doc**, not left for implementer mid-move. Format: table with columns `File / Line`, `Primitive`, `Current Semantics`, `Migration Strategy`, `Owner`.

**Why mandatory:**

Monorepo extraction changes process cwd from `<repo>/` to `<repo>/apps/<name>/` at runtime. Code reading `process.cwd()` to locate sibling files silently starts resolving to workspace subtree, returning null/crashing on first real user request. Invisible to build, typecheck, unit tests, and import-path greps — every Plan 15 automated gate was green while `readPage('/wiki/some-real-page')` returned null because `process.cwd()` pointed at `apps/next/` instead of repo root. Bug reached Preview Gate because no earlier check exercised real content through moved code.

Audit = plan-level equivalent of security review for path resolution. Skipping it pushes audit into implementation time, when implementer focused on TDD and commit cadence is less likely to catch silent cwd drift.

**When rule applies:**

| Plan type | Monorepo audit required? |
|-----------|--------------------------|
| Pure monorepo extraction (`lib/` → `packages/x`, `app/` → `apps/y`) | YES |
| New workspace that reads sibling code (even if no move) | YES |
| Moving a file to new package, preserving content | YES |
| Any plan changing which directory dev/prod process launches from | YES |
| In-place refactor, no directory boundary change | NO |

If audit surfaces call-sites with non-trivial migration strategy (option (a)/(c) with runtime plumbing needed), mark those sections `**REQUIRES ARCHITECT**` and consult pidex-architect before finalizing.
