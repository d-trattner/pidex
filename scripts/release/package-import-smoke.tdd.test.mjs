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
  // Plan 059 closure: shared TBR serialization lock, state-root resolver, and the
  // Project Pipeline archive/registry helpers imported by the lifecycle boundary.
  'modules/pidex/analysis-metrics-history/lib/tbr-lock.mjs',
  'modules/pidex/analysis-metrics-history/lib/state-root.mjs',
  'modules/pidex/project-pipeline/scripts/project-pipeline/archive-sync.mjs',
  'modules/pidex/project-pipeline/scripts/project-pipeline/registry.mjs',
]);
// Plan 059 closure: canonical TBR/finding validators imported by event.mjs through
// the structured completion boundary must ship with the package.
const requiredScripts = new Set([
  'scripts/quality/tbr.mjs',
  'scripts/quality/structured-review.mjs',
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

// npm >=11 restricts subpath exports to only "." and "./package.json", so
// require.resolve('npm/bin/npm-cli.js') fails even where npm is installed. Derive
// the bundled npm CLI deterministically from the running node installation,
// shell-free: Windows ships npm at <nodeDir>/node_modules/npm; POSIX installs
// (nodejs.org, nvm, system, Homebrew) at <prefix>/lib/node_modules/npm with
// prefix = dirname(nodeDir). Spawning process.execPath + npm-cli.js avoids shell
// resolution and Windows .cmd shim differences.
function npmCliPath() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`npm CLI not found under node installation ${nodeDir} (tried: ${candidates.join(', ')})`);
}
function run(command, args, options = {}) {
  const proc = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...options });
  const statusMessage = proc.error ? `${proc.error.code}: ${proc.error.message}` : '';
  assert.equal(proc.status, 0, `${statusMessage}\n${proc.stderr}\n${proc.stdout}`);
  return proc;
}
function runNpm(args, options = {}) {
  const proc = run(process.execPath, [npmCliPath(), ...args], { ...options });
  return proc;
}
test('published tarball contains exact lifecycle closure and imports with real isolated peers', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'pidex-package-import-'));
  const consumer = path.join(temp, 'consumer');
  try {
    mkdirSync(consumer, { recursive: true });
    const packed = runNpm(['pack', '--json', '--pack-destination', temp], { cwd: root });
    const report = JSON.parse(packed.stdout)[0];
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(report.version, manifest.version);
    assert.ok(report.unpackedSize < 900_000, `unpacked package budget exceeded: ${report.unpackedSize}`);
    const modulePaths = report.files.map((item) => item.path).filter((item) => item.startsWith('modules/'));
    assert.deepEqual(new Set(modulePaths), requiredModules);
    assert.equal(modulePaths.length, requiredModules.size, 'module closure contains duplicate or unexpected entries');
    const scriptPaths = report.files.map((item) => item.path).filter((item) => item.startsWith('scripts/quality/'));
    assert.deepEqual(new Set(scriptPaths), requiredScripts, 'quality validator closure must ship for the lifecycle boundary import');
    assert.equal(scriptPaths.length, requiredScripts.size, 'quality validator closure contains duplicate or unexpected entries');
    for (const item of report.files) {
      assert.equal(path.isAbsolute(item.path), false);
      assert.equal(item.path.split(/[\\/]/).includes('..'), false);
    }

    writeFileSync(path.join(consumer, 'package.json'), '{"name":"pidex-package-consumer","private":true,"type":"module"}\n');
    const tarball = path.join(temp, report.filename);
    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--legacy-peer-deps', '--no-save', tarball], { cwd: consumer, env: { ...process.env, HOME: path.join(temp, 'home'), NODE_PATH: '' } });
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
