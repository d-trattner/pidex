import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allCapabilities, capabilityAvailability, loadModuleSystem, moduleEnabled, validateSystem } from '../../../scripts/modules/lib.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('pidex.angular is default-on but a local module override disables every capability fail-closed', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-angular-toggle-'));
  try {
    mkdirSync(path.join(root, 'modules/pidex'), { recursive: true });
    cpSync(path.join(repo, 'modules/pidex/core'), path.join(root, 'modules/pidex/core'), { recursive: true });
    cpSync(path.join(repo, 'modules/pidex/angular'), path.join(root, 'modules/pidex/angular'), { recursive: true });
    cpSync(path.join(repo, 'agents'), path.join(root, 'agents'), { recursive: true });
    mkdirSync(path.join(root, 'config'), { recursive: true }); writeFileSync(path.join(root, 'config/modules.local.json'), '{"modules":{"pidex.angular":{"enabled":false}}}\n');
    const system = loadModuleSystem(root);
    assert.equal(validateSystem(system).ok, true);
    const angular = system.byId.get('pidex.angular').manifest;
    assert.deepEqual(moduleEnabled(system, angular), { enabled: false, locked: false, source: 'config' });
    for (const entry of allCapabilities(system).filter((item) => item.module.id === 'pidex.angular')) {
      assert.equal(capabilityAvailability(system, entry, 'orchestrator', 'preflight', root).reason, 'module_disabled');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
