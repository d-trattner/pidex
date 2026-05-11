# Rule: Port-Change Package.json Script Audit

PROC-NEW-22 | pidex-implementer

## Rule

**When a plan changes `server.port` in `vite.config.ts` (or equivalent Vite config): audit all `package.json` scripts for `--port N` flags and update them to match in the same slice.**

`package.json` script `--port` flags override `vite.config.ts` `server.port`. If both exist with different values, the script flag wins — the config change has no effect.

## Steps

1. Note the new port value from the plan.
2. Find all `package.json` files in the workspace:
   ```bash
   find <project-root> -name "package.json" -not -path "*/node_modules/*"
   ```
3. In each file, grep for `--port`:
   ```bash
   grep -n "\-\-port" <path>/package.json
   ```
4. For any `--port N` where N differs from the new config port: update it to the new port.
5. Include all `package.json` edits in the same commit as the `vite.config.ts` change.

## Verification

After the slice is committed, confirm by running the dev server and checking the terminal output for the port it reports (`Local: http://localhost:XXXX`). Do not rely solely on an HTTP probe — the server may have started on the old port.

## Scope

Applies to any plan that:
- Changes `server.port` in `vite.config.ts`
- Changes a Vite preview port (`preview.port`)
- Changes the dev server port for any workspace package

## Empirical basis

Plan 34 (plan-d-nextjs-removal): `vite.config.ts` set to port 3000 but `apps/web/package.json` dev/preview scripts had `--port 3100`, overriding the config. Discovered at QA. Orchestrator fixed under Rule 10a. Fix belonged in the Vite config change slice.
