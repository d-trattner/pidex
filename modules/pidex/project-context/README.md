# PIDEX Project Context Module

Owns project context initialization and project metadata migration helpers.

## Module-owned implementation

- `modules/pidex/project-context/scripts/project-context/init.mjs`
- `modules/pidex/project-context/scripts/project-metadata/migrate-to-pidex-folder.mjs`

## Compatibility wrappers

- `scripts/project-context/init.mjs` remains while active skill/docs callers migrate.
- The former root project-metadata migration wrapper has been retired; use the module-owned implementation or a module capability when one is added.

## Safety

This module has project write-path behavior. Any future changes require containment tests and focused security review.

Dashboard context views remain dashboard host/core files until dashboard contribution loader design exists.
