# PIDEX Angular/Nx new-application procedure

Use only after project path, Angular/Nx topology, Material choice, package manager, rendering strategy and network/dependency authority are confirmed.

1. Re-run `angular.source-check` and inspect the destination parent/project state.
2. Select exact pinned versions; never moving `latest` in a reproducible run.
3. Prefer pnpm unless the user/project chooses npm compatibility.
4. For plain Angular, invoke the exact Angular CLI package in a disposable/staged destination with noninteractive flags. For Nx, invoke the exact `create-nx-workspace`/Nx versions compatible with Angular 22.
5. Do not request or generate MCP, Angular/Nx AI-config, Nx Cloud, CI automation, analytics or global CLI installation.
6. Review every generated dependency, lockfile, instruction/config and root layout change before accepting it into the project.
7. Add Material/CDK only when selected, keeping Angular/Material/CDK aligned.
8. Build one thin tracer feature, run build/tests, then preview/browser/AXE for UI.
9. Record exact versions, command argv, generated paths, evidence and rollback point.

Official `angular-new-app` is retained as provenance input, but this constrained procedure is authoritative inside PIDEX where it differs on global installation, moving versions, MCP or generated AI configuration.
