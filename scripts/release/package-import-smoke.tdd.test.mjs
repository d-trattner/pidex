import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const peers = ['@earendil-works/pi-agent-core', '@earendil-works/pi-ai', '@earendil-works/pi-coding-agent', 'typebox'];
const requiredModules = new Set([
  'modules/pidex/analysis-metrics-history/lib/project-key.mjs',
  'modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs',
  'modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs',
]);

function packageRootFor(specifier) {
  const entry = fileURLToPath(import.meta.resolve(specifier));
  let cursor = path.dirname(entry);
  while (cursor !== path.dirname(cursor)) {
    const pkg = path.join(cursor, 'package.json');
    if (existsSync(pkg)) {
      try { if (JSON.parse(readFileSync(pkg, 'utf8')).name === specifier) return cursor; } catch {}
    }
    cursor = path.dirname(cursor);
  }
  throw new Error(`actual peer package not found: ${specifier}`);
}

function linkPeer(consumer, specifier) {
  const source = packageRootFor(specifier);
  const destination = path.join(consumer, 'node_modules', ...specifier.split('/'));
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(source, destination, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(realpathSync(destination), realpathSync(source));
}

function run(command, args, options = {}) {
  const proc = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...options });
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  return proc;
}

test('published tarball contains exact lifecycle closure and imports with real isolated peers', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'pidex-package-import-'));
  const consumer = path.join(temp, 'consumer');
  try {
    mkdirSync(consumer, { recursive: true });
    const packed = run('npm', ['pack', '--json', '--pack-destination', temp], { cwd: root });
    const report = JSON.parse(packed.stdout)[0];
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(report.version, manifest.version);
    assert.ok(report.unpackedSize < 700_000, `unpacked package budget exceeded: ${report.unpackedSize}`);
    const modulePaths = report.files.map((item) => item.path).filter((item) => item.startsWith('modules/'));
    assert.deepEqual(new Set(modulePaths), requiredModules);
    assert.equal(modulePaths.length, requiredModules.size, 'module closure contains duplicate or unexpected entries');
    for (const item of report.files) {
      assert.equal(path.isAbsolute(item.path), false);
      assert.equal(item.path.split(/[\\/]/).includes('..'), false);
    }

    writeFileSync(path.join(consumer, 'package.json'), '{"name":"pidex-package-consumer","private":true,"type":"module"}\n');
    const tarball = path.join(temp, report.filename);
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--legacy-peer-deps', '--no-save', tarball], { cwd: consumer, env: { ...process.env, HOME: path.join(temp, 'home'), NODE_PATH: '' } });
    for (const peer of peers) linkPeer(consumer, peer);

    const installedInNodeModules = path.join(consumer, 'node_modules', '@d-trattner', 'pidex');
    const extractedPackage = path.join(consumer, 'pidex-under-test');
    renameSync(installedInNodeModules, extractedPackage);
    const installed = realpathSync(extractedPackage);
    const extension = path.join(installed, 'extensions', 'pidex', 'index.ts');
    for (const internal of requiredModules) {
      const resolved = realpathSync(path.join(installed, internal));
      assert.ok(resolved.startsWith(`${installed}${path.sep}`));
      assert.equal(resolved.startsWith(`${realpathSync(root)}${path.sep}`), false);
    }
    assert.equal(existsSync(path.join(installed, 'state')), false);

    const child = run(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(extension).href)});`], {
      cwd: consumer,
      env: { ...process.env, HOME: path.join(temp, 'home'), NODE_PATH: '', PIDEX_ROOT: path.join(temp, 'missing-pidex-root'), PIDEX_STATE_DIR: path.join(temp, 'state') },
    });
    assert.equal(child.stdout, '');
    assert.equal(child.stderr, '');
    assert.equal(existsSync(path.join(temp, 'state')), false, 'extension import must not create lifecycle state');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
