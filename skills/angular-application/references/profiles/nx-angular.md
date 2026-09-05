# Nx Angular monorepo profile

Activate when Nx is detected or explicitly requested.

- Keep `nx` and all `@nx/*` packages on the same version.
- For the pinned Angular 22.1 target, require Nx 23.2 or newer within the current official compatibility matrix. Nx 23.1 starts Angular 22.0 support but does not cover Angular 22.1.
- Use workspace-local Nx; never a global or moving `latest` command during normal work.
- Read `nx.json`, but obtain complete project configuration from `nx show project <name> --json` because plugins infer targets.
- Use `nx show projects --json` and `nx graph --print` for workspace/dependency truth.
- Discover generators and inspect options before execution; generate first, then adapt.
- Use explicit projects/targets for focused work and `nx affected` when a valid base/head comparison exists.
- Preserve tags, dependency constraints, named inputs, outputs and cache semantics.
- Do not enable Nx Cloud, self-healing CI, MCP, daemon sockets across sandbox boundaries, or generated agent configuration implicitly.
- Keep app/library creation, migrations and dependency changes separately reviewable.

For XL acceptance, verify multiple apps/libraries, inferred targets, graph boundaries, affected selection, full regression, and one follow-up cross-layer feature.
