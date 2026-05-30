import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function makeModuleFixture(options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-modules-test-'));
  if (options.cleanup !== false) process.on('exit', () => rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  mkdirSync(project, { recursive: true });
  mkdirSync(path.join(root, 'agents'), { recursive: true });
  mkdirSync(path.join(root, 'config'), { recursive: true });
  mkdirSync(path.join(root, 'modules/pidex/core'), { recursive: true });
  mkdirSync(path.join(root, 'modules/pidex/release-safety'), { recursive: true });
  mkdirSync(path.join(root, 'scripts/release'), { recursive: true });
  writeFileSync(path.join(root, 'agents/pidex-devops.md'), '# devops\n');
  writeFileSync(path.join(root, 'agents/pidex-pi.md'), '# pi\n');
  writeFileSync(path.join(root, 'config/modules.json'), JSON.stringify({ modules: { 'pidex.release-safety': { enabled: options.releaseEnabled ?? true } } }, null, 2));
  writeFileSync(path.join(root, 'modules/pidex/core/module.json'), JSON.stringify({
    id: 'pidex.core', schema_version: 1, name: 'Core', kind: 'core-required', default_enabled: true, dependencies: [], capabilities: [],
  }, null, 2));
  writeFileSync(path.join(root, 'modules/pidex/release-safety/module.json'), JSON.stringify({
    id: 'pidex.release-safety', schema_version: 1, name: 'Release Safety', kind: 'core-toggleable', default_enabled: true, dependencies: ['pidex.core'], capabilities: [{
      id: 'release.reference-integrity', kind: 'check', phases: ['pre-release'], scope: 'install', importance: 'required', allowed_agents: ['orchestrator', 'pidex-devops', 'pidex-pi'], supported_platforms: ['linux', 'wsl2', 'macos'], mutability: ['read-only'], command: { bin: 'node', args: ['scripts/release/reference-integrity.mjs'] },
    }],
  }, null, 2));
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log('fixture reference ok');\n");
  return { root, project };
}
