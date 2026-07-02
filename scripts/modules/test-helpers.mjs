import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      id: 'release.reference-integrity', kind: 'check', phases: ['pre-release'], scope: 'install', importance: 'recommended', allowed_agents: ['orchestrator', 'pidex-devops', 'pidex-pi'], supported_platforms: ['linux', 'wsl2', 'macos'], mutability: ['read-only'], command: { bin: 'node', args: ['scripts/release/reference-integrity.mjs'] },
    }],
  }, null, 2));
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log('fixture reference ok');\n");
  writeFileSync(path.join(root, 'scripts/release/fail.mjs'), "console.error('fixture failure'); process.exit(7);\n");
  return { root, project };
}

export function addFixtureAgentRule(root, overrides = {}) {
  const moduleDir = path.join(root, 'modules/pidex/release-safety');
  const rulesDir = path.join(moduleDir, 'rules/pidex-devops');
  mkdirSync(rulesDir, { recursive: true });
  const rulePath = overrides.path || 'rules/pidex-devops/pre-release.md';
  const targetRuleFile = path.join(moduleDir, rulePath);
  mkdirSync(path.dirname(targetRuleFile), { recursive: true });
  writeFileSync(targetRuleFile, overrides.content || '# Release module rule\n');
  const manifestPath = path.join(moduleDir, 'module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.agent_rules = [
    {
      id: 'pidex.release-safety.pre-release-devops',
      agent: 'pidex-devops',
      phases: ['pre-release'],
      path: rulePath,
      authority: 'module-scoped',
      summary: 'Release safety pre-release rule',
      audience_scope: 'pre-release',
      applies_when: { mode: 'release', capabilities: ['release.reference-integrity'] },
      ...overrides.rule,
    },
  ];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest.agent_rules[0];
}
