# pidex.release-safety

Internal PIDEX module for release-safety helper checks.

## Authority boundary

The canonical public release authority is fixed core:

```text
scripts/release/public-readiness.sh
```

Public-readiness is intentionally not a normal module capability. It must remain available even if toggleable modules are disabled, and it still validates module manifests/config as release inputs.

Core-owned helpers:

```text
scripts/release/public-readiness-check.mjs
scripts/release/reference-integrity.mjs
```

## Module capability

This module exposes non-authority helper checks, currently:

```text
release.reference-integrity
```

That capability invokes the core helper through the module runner. It is advisory/recommended for agent workflows; it is not the public release authority.

## Shim retirement

The temporary module-tree release-safety compatibility shims have been retired. Use fixed-core release scripts above, or invoke the remaining helper capability through `scripts/modules/run-check.mjs`.
