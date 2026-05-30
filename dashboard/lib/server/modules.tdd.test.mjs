import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { getModulesStatus } = await import('./modules.ts');

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-dashboard-modules-'));
  mkdirSync(path.join(root, 'modules/pidex/core'), { recursive: true });
  mkdirSync(path.join(root, 'modules/pidex/release-safety'), { recursive: true });
  mkdirSync(path.join(root, 'config'), { recursive: true });
  writeFileSync(path.join(root, 'modules/pidex/core/module.json'), JSON.stringify({
    id: 'pidex.core', name: 'Core', kind: 'core-required', dependencies: [], capabilities: [], schema_version: 1,
  }, null, 2));
  writeFileSync(path.join(root, 'modules/pidex/release-safety/module.json'), JSON.stringify({
    id: 'pidex.release-safety', name: 'Release Safety', kind: 'core-toggleable', dependencies: ['pidex.core'], default_enabled: true, schema_version: 1,
    capabilities: [{ id: 'release.reference-integrity', kind: 'check', phases: ['pre-release'], scope: 'install', importance: 'required', mutability: ['read-only'], allowed_agents: ['pidex-devops'], supported_platforms: ['linux'] }],
  }, null, 2));
  writeFileSync(path.join(root, 'config/modules.json'), JSON.stringify({ modules: { 'pidex.release-safety': { enabled: true } } }, null, 2));
  return root;
}

{
  const root = fixture();
  const status = getModulesStatus(root);
  assert.equal(status.ok, true);
  assert.equal(status.totals.modules, 2);
  assert.equal(status.totals.enabled, 2);
  assert.equal(status.totals.capabilities, 1);
  const core = status.modules.find((module) => module.id === 'pidex.core');
  assert.equal(core?.locked, true);
  const release = status.modules.find((module) => module.id === 'pidex.release-safety');
  assert.equal(release?.source, 'config');
  assert.equal(release?.capabilities[0]?.id, 'release.reference-integrity');
}

{
  const root = fixture();
  mkdirSync(path.join(root, 'state/modules/evidence'), { recursive: true });
  writeFileSync(path.join(root, 'state/modules/evidence/2026-05-30.jsonl'), `${JSON.stringify({ type: 'module_capability_evidence', capability_id: 'release.reference-integrity', module_id: 'pidex.release-safety', status: 'passed', exit_code: 0, ended_at: '2026-05-30T00:00:00Z' })}\n`);
  const status = getModulesStatus(root);
  const release = status.modules.find((module) => module.id === 'pidex.release-safety');
  assert.equal(release?.capabilities[0]?.latest_evidence?.status, 'passed');
  assert.equal(release?.capabilities[0]?.latest_evidence?.exit_code, 0);
}

console.log('dashboard module status tests passed');
