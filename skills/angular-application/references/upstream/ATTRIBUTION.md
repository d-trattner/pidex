# Upstream attribution

## Angular Agent Skills

- Mirror: https://github.com/angular/skills
- Mirror commit: `a8d71e4fcf4e504e428c9a0befaefd77b83a8480`
- `BUILD_INFO` source: https://github.com/angular/angular/tree/563850e860bd887820b6ddea4638017dd8ef2293/skills/dev-skills
- License: MIT, Copyright 2010–2026 Google LLC
- Packaged entry filenames are renamed from `SKILL.md` to prevent duplicate Pi skill discovery; reference contents otherwise retain their upstream text.

## Angular Material

- Source: https://github.com/angular/components/tree/5d64e397b47e722e6ec8cd9eed69cd032766f656
- Documentation: https://material.angular.dev/
- Baseline packages: `@angular/material@22.1.4`, `@angular/cdk@22.1.4`
- License: MIT, Copyright 2010–2026 Google LLC
- PIDEX packages a reference map, not a wholesale documentation copy.

## Nx Agent Skills

- Source: https://github.com/nrwl/nx/tree/c598d4e2fae2a75e2690e69f09d943d66b1489d8/.agents/skills
- Selected files: `nx-workspace`, `AFFECTED`, `nx-generate`, `nx-run-tasks`, `nx-plugins`, `link-workspace-packages`
- Baseline packages: `nx@23.1.2`, `@nx/angular@23.1.2`
- License: MIT, Copyright (c) 2017–2026 Narwhal Technologies Inc.
- MCP, AI-config and CI-cloud automation skills are intentionally excluded.

Exact packaged members and SHA-256 digests are recorded in `UPSTREAM.json` and the PIDEX Angular module source lock.
