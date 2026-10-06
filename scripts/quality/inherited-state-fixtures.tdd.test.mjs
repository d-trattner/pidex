import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Focus real publication/recovery and fixture-lock behavior; do not repeat expensive fault ledgers.
const CASES = [
  { file: 'scripts/quality/operator-contracts-admin.tdd.test.mjs', marker: 'quality operator-contracts-admin.mjs tests passed' },
  { file: 'scripts/quality/contract-governor.tdd.test.mjs', marker: 'quality contract-governor.mjs tests passed' },
  { file: 'scripts/quality/rule-exposure.tdd.test.mjs', pattern: '^(supported capability publication|Windows UC-1B-WIN publication|recovery classifies torn|CO-49-1 native|C-1 \\+ M-3 writes|fixture explicit)', count: process.platform === 'win32' ? 7 : 8 },
  { file: 'modules/pidex/project-pipeline/scripts/project-pipeline/rule-exposure-tracer.tdd.test.mjs', pattern: '^(C49-3-AUTH-tracer|C49-5 Windows witness|Plan046 tracer preserves|fixture explicit)', count: 6 },
  { file: 'scripts/quality/plan-042-preservation.tdd.test.mjs', pattern: '^(P42-49-V1|RPV-49-1 seeded|RP-49 concurrent|fixture explicit)', count: 6 },
];

for (const mode of ['canonical', 'legacy', 'both']) {
  for (const fixture of CASES) {
    test(`inherited ${mode} state cannot redirect ${fixture.file}`, () => {
      const before = [process.env.PIDEX_STATE_DIR, process.env.RUNNING_PI_STATE_DIR];
      const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-related-env-'));
      try {
        for (const name of ['canonical', 'legacy', 'home', 'tmp']) mkdirSync(path.join(root, name));
        for (const name of ['canonical', 'legacy']) {
          mkdirSync(path.join(root, name, 'foreign'));
          writeFileSync(path.join(root, name, 'foreign', 'sentinel'), `untouched ${name}\n`);
        }
        // Git for Windows rejects Node's null-device path as a config file.
        // A real empty file keeps global user configuration isolated on every OS.
        const gitConfig = path.join(root, 'gitconfig');
        writeFileSync(gitConfig, '', { flag: 'wx' });
        const inheritedGitConfig = process.env.GIT_CONFIG_GLOBAL;
        const env = { ...process.env, HOME: path.join(root, 'home'), USERPROFILE: path.join(root, 'home'), TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'), XDG_CONFIG_HOME: path.join(root, 'home', 'config'), XDG_STATE_HOME: path.join(root, 'home', 'state'), GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' };
        assert.equal(lstatSync(env.GIT_CONFIG_GLOBAL).isFile(), true, 'Git global config must be a real private file, not a null device');
        // Child copy only: launcher environment and caller process.env remain intact.
        delete env.NODE_TEST_CONTEXT;
        delete env.PIDEX_STATE_DIR;
        delete env.RUNNING_PI_STATE_DIR;
        if (mode !== 'legacy') env.PIDEX_STATE_DIR = path.join(root, 'canonical');
        if (mode !== 'canonical') env.RUNNING_PI_STATE_DIR = path.join(root, 'legacy');
        const args = fixture.pattern ? ['--test', '--test-reporter=tap', `--test-name-pattern=${fixture.pattern}`, fixture.file] : [fixture.file];
        const child = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8', timeout: 60_000 });
        assert.equal(child.error, undefined, child.error?.message);
        assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
        assert.equal(readFileSync(gitConfig, 'utf8'), '', 'child leaves private global config empty');
        assert.equal(process.env.GIT_CONFIG_GLOBAL, inheritedGitConfig, 'caller Git configuration remains unchanged');
        if (fixture.marker) assert.ok(child.stdout.includes(fixture.marker), 'ordinary assertion script must reach completion');
        else {
          assert.match(child.stdout, new RegExp(`# pass ${fixture.count}\\b`), 'selected child tests must actually execute');
          assert.match(child.stdout, /# fail 0\b/);
        }
        for (const name of ['canonical', 'legacy']) {
          assert.deepEqual(readdirSync(path.join(root, name)), ['foreign'], `${name}: no inherited-state writes allowed`);
          assert.deepEqual(readdirSync(path.join(root, name, 'foreign')), ['sentinel']);
          assert.equal(readFileSync(path.join(root, name, 'foreign', 'sentinel'), 'utf8'), `untouched ${name}\n`);
        }
        assert.deepEqual([process.env.PIDEX_STATE_DIR, process.env.RUNNING_PI_STATE_DIR], before);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
}
