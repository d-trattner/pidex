# PIDEX Project Context Module

Owns project context initialization and project metadata migration helpers.

## Module-owned implementation

- `modules/pidex/project-context/scripts/project-context/init.mjs`
- `modules/pidex/project-context/scripts/project-metadata/migrate-to-pidex-folder.mjs`

## Compatibility wrappers

- `scripts/project-context/init.mjs`
- `scripts/project-metadata/migrate-to-pidex-folder.mjs`

## Safety

This module has project write-path behavior. Any future changes require containment tests and focused security review.

Dashboard context views remain dashboard host/core files until dashboard contribution loader design exists.
