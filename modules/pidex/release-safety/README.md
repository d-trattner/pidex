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

This module may expose non-authority helper checks, currently:

```text
release.reference-integrity
```

That capability invokes the core helper through the module runner. It is advisory/recommended for agent workflows; it is not the public release authority.

## Compatibility shims

Temporary compatibility shims remain under:

```text
modules/pidex/release-safety/scripts/public-readiness.sh
modules/pidex/release-safety/scripts/public-readiness-check.mjs
modules/pidex/release-safety/scripts/reference-integrity.mjs
```

These shims forward to the fixed core scripts and must not be treated as authority. They may be retired after one successful release cycle after this reclassification, once no internal references depend on them.
