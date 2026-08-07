import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(path.resolve('extensions/pidex/index.ts')).href);
const helperAbs = path.resolve(['modules', 'pidex', 'sandbox-runtime', 'scripts', 'sandbox', 'status.mjs'].join('/'));
const context = {
  mode: 'hardened-pipeline',
  runId: 'sandbox-test01',
  hostProjectRoot: path.resolve('.'),
  sandboxWorkspace: '/tmp/pidex-sandbox/workspace',
  allowedWriteRoot: '/tmp/pidex-sandbox/workspace',
};

function withSandboxContext(fn) {
  const prev = process.env.PIDEX_SANDBOX_CONTEXT;
  process.env.PIDEX_SANDBOX_CONTEXT = JSON.stringify(context);
  try { return fn(); }
  finally {
    if (prev === undefined) delete process.env.PIDEX_SANDBOX_CONTEXT;
    else process.env.PIDEX_SANDBOX_CONTEXT = prev;
  }
}

function inspect(command) {
  return withSandboxContext(() => mod.inspectSandboxToolCall({ toolName: 'bash', input: { command } }, { cwd: context.sandboxWorkspace }));
}

function withoutProjectBoundaryEnv(fn) {
  const prev = process.env.PIDEX_PROJECT_BOUNDARY_CONTEXT;
  delete process.env.PIDEX_PROJECT_BOUNDARY_CONTEXT;
  try { return fn(); }
  finally {
    if (prev === undefined) delete process.env.PIDEX_PROJECT_BOUNDARY_CONTEXT;
    else process.env.PIDEX_PROJECT_BOUNDARY_CONTEXT = prev;
  }
}

function git(cwd, args) { const p = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); return p.stdout.trim(); }
function tmpRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-extension-sandbox-test-'));
  git(dir, ['init']); git(dir, ['config', 'user.email', 't@example.invalid']); git(dir, ['config', 'user.name', 'T']);
  writeFileSync(path.join(dir, 'README.md'), 'base\n');
  writeFileSync(path.join(dir, '.gitignore'), '');
  git(dir, ['add', '-A']); git(dir, ['commit', '-m', 'base']);
  return dir;
}

test('active sandbox bash guard allows only canonical helper bash', () => {
  assert.equal(inspect(`node ${helperAbs} --pidex-root ${path.resolve('.')} --run-id sandbox-test01 --json`), undefined);
});

test('active sandbox bash guard denies raw host bash by default', () => {
  for (const command of [
    'cat ~/.npmrc',
    'env',
    'docker ps',
    'docker run -v /:/host alpine ls /host',
    'curl https://example.com',
    'touch /tmp/pidex-host-file',
  ]) {
    const result = inspect(command);
    assert.equal(result?.block, true, command);
    assert.match(result.reason, /blocks raw host bash/);
  }
});

test('active sandbox bash guard denies missing bash command', () => {
  const result = withSandboxContext(() => mod.inspectSandboxToolCall({ toolName: 'bash', input: {} }, { cwd: context.sandboxWorkspace }));
  assert.equal(result?.block, true);
  assert.match(result.reason, /without an explicit command/);
});

test('sandbox routing context must use agents.output artifact channel', () => {
  assert.deepEqual(mod.validateSandboxRoutingContext('pidex-qa', 'agents.output/qa/report.md'), { ok: true });
  const bad = mod.validateSandboxRoutingContext('pidex-qa', 'README.md');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /artifact channel/);
});

test('sandbox source status ignores PIDEX runtime paths and allowed gitignore additions', () => {
  const repo = tmpRepo();
  mkdirSync(path.join(repo, 'agents.output'), { recursive: true });
  writeFileSync(path.join(repo, 'agents.output/report.md'), 'artifact\n');
  mkdirSync(path.join(repo, 'pidex/context'), { recursive: true });
  writeFileSync(path.join(repo, 'pidex/context/CONTEXT.md'), 'context\n');
  mkdirSync(path.join(repo, '.fallow'), { recursive: true });
  writeFileSync(path.join(repo, '.fallow/cache.bin'), 'cache\n');
  writeFileSync(path.join(repo, '.gitignore'), 'agents.output/\npidex/state/\n.fallow/\n');
  assert.equal(mod.gitSourceStatusPorcelain(repo), '');
  writeFileSync(path.join(repo, 'README.md'), 'dirty\n');
  assert.match(mod.gitSourceStatusPorcelain(repo), /README\.md/);
});

test('validation source mutation ignores untracked local wiki but rejects tracked wiki', () => {
  const repo = tmpRepo();
  assert.deepEqual(mod.validationSourceMutationFiles(repo, [{ status: 'M', paths: ['wiki/log.md'] }]), []);
  mkdirSync(path.join(repo, 'wiki'), { recursive: true });
  writeFileSync(path.join(repo, 'wiki/product.md'), 'tracked\n');
  git(repo, ['add', 'wiki/product.md']);
  git(repo, ['commit', '-m', 'track wiki product doc']);
  assert.deepEqual(mod.validationSourceMutationFiles(repo, [{ status: 'M', paths: ['wiki/product.md'] }]), ['wiki/product.md']);
});

test('project boundary blocks structured writes outside project but allows pidex reads', () => withoutProjectBoundaryEnv(() => {
  const repo = tmpRepo();
  const outside = mkdtempSync(path.join(os.tmpdir(), 'pidex-boundary-outside-'));
  const writeBlock = mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: path.join(outside, 'x.txt') } }, { cwd: repo });
  assert.equal(writeBlock?.block, true);
  const writeInside = mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: path.join(repo, 'x.txt') } }, { cwd: repo });
  assert.equal(writeInside, undefined);
  const readPidex = mod.inspectProjectBoundaryToolCall({ toolName: 'read', input: { path: path.resolve('README.md') } }, { cwd: repo });
  assert.equal(readPidex, undefined);
  const readSecret = mod.inspectProjectBoundaryToolCall({ toolName: 'read', input: { path: path.join(repo, '.env') } }, { cwd: repo });
  assert.equal(readSecret?.block, true);
}));

test('project boundary blocks high-risk bash host mutations', () => {
  const repo = tmpRepo();
  for (const command of ['git config --global core.hooksPath /tmp/x', 'npm config set //registry.npmjs.org/:_authToken x', 'docker run -v /:/host alpine true']) {
    const result = mod.inspectProjectBoundaryToolCall({ toolName: 'bash', input: { command } }, { cwd: repo });
    assert.equal(result?.block, true, command);
  }
});

function missingPath() {
  return Object.assign(new Error('missing'), { code: 'ENOENT' });
}

function win32Evidence(entries) {
  const key = (value) => value.toLowerCase();
  return {
    platform: 'win32',
    pathApi: path.win32,
    lstatSync(value) {
      const entry = entries.get(key(value));
      if (!entry || entry.kind === 'missing') throw missingPath();
      if (entry.lstatError) throw Object.assign(new Error(entry.lstatError), { code: entry.lstatError });
      return { isDirectory: () => entry.kind === 'directory', isSymbolicLink: () => Boolean(entry.symbolicLink) };
    },
    realpathNative(value) {
      const entry = entries.get(key(value));
      if (!entry?.canonical || entry.realpathError) throw Object.assign(new Error(entry?.realpathError || 'unresolvable'), { code: entry?.realpathError || 'EACCES' });
      return entry.canonical;
    },
  };
}

function withProjectBoundary(value, fn) {
  const previous = process.env.PIDEX_PROJECT_BOUNDARY_CONTEXT;
  process.env.PIDEX_PROJECT_BOUNDARY_CONTEXT = JSON.stringify(value);
  try { return fn(); }
  finally {
    if (previous === undefined) delete process.env.PIDEX_PROJECT_BOUNDARY_CONTEXT;
    else process.env.PIDEX_PROJECT_BOUNDARY_CONTEXT = previous;
  }
}

test('boundary identity canonicalizes a mapped root to native UNC evidence', () => {
  const adapter = win32Evidence(new Map([
    ['z:\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
  ]));
  assert.deepEqual(mod.resolveProjectBoundaryPathIdentity('Z:\\project', 'Z:\\project', 'existing-root', adapter), {
    tag: 'success',
    canonicalPath: '\\\\server\\share\\project',
    lexicalPath: 'Z:\\project',
    evidenceKind: 'existing',
  });
});

test('project boundary accepts evidence-backed mapped-drive and UNC aliases for every structured path', () => {
  const entries = new Map([
    ['z:\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
    ['z:\\pidex', { kind: 'directory', canonical: '\\\\server\\share\\pidex' }],
    ['\\\\server\\share\\project\\existing.txt', { kind: 'file', canonical: '\\\\server\\share\\project\\existing.txt' }],
    ['z:\\project\\existing.txt', { kind: 'file', canonical: '\\\\server\\share\\project\\existing.txt' }],
    ['\\\\server\\share\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
  ]);
  const adapter = win32Evidence(entries);
  const context = { cwd: 'Z:\\project' };
  const boundary = { active: true, projectRoot: 'Z:\\project', pidexRoot: 'Z:\\pidex', startedCwd: 'Z:\\project' };

  withProjectBoundary(boundary, () => {
    for (const [toolName, target] of [
      ['read', '\\\\server\\share\\project\\existing.txt'],
      ['edit', '\\\\server\\share\\project\\existing.txt'],
      ['write', '\\\\server\\share\\project\\existing.txt'],
      ['write', '\\\\server\\share\\project\\new\\child.txt'],
    ]) {
      assert.equal(mod.inspectProjectBoundaryToolCall({ toolName, input: { path: target } }, context, adapter), undefined, `${toolName} mapped root -> UNC target`);
    }
  });

  entries.set('\\\\server\\share\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' });
  entries.set('z:\\project\\new\\child.txt', { kind: 'missing' });
  entries.set('z:\\project\\new', { kind: 'missing' });
  withProjectBoundary({ ...boundary, projectRoot: '\\\\server\\share\\project', startedCwd: '\\\\server\\share\\project' }, () => {
    for (const [toolName, target] of [
      ['read', 'Z:\\project\\existing.txt'],
      ['edit', 'Z:\\project\\existing.txt'],
      ['write', 'Z:\\project\\existing.txt'],
      ['write', 'Z:\\project\\new\\child.txt'],
    ]) {
      assert.equal(mod.inspectProjectBoundaryToolCall({ toolName, input: { path: target } }, { cwd: '\\\\server\\share\\project' }, adapter), undefined, `${toolName} UNC root -> mapped target`);
    }
  });
});

test('project boundary preserves normalized Win32 and POSIX prospective path syntax inside canonical containment', () => {
  const entries = new Map([
    ['z:\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
    ['z:\\pidex', { kind: 'directory', canonical: '\\\\server\\share\\pidex' }],
    ['z:\\project\\existing.txt', { kind: 'file', canonical: '\\\\server\\share\\project\\existing.txt' }],
    ['c:\\outside.txt', { kind: 'file', canonical: '\\\\server\\other\\outside.txt' }],
    ['z:\\child.txt', { kind: 'file', canonical: '\\\\server\\other\\child.txt' }],
  ]);
  const adapter = win32Evidence(entries);
  const boundary = { active: true, projectRoot: 'Z:\\project', pidexRoot: 'Z:\\pidex', startedCwd: 'Z:\\project' };
  withProjectBoundary(boundary, () => {
    assert.equal(mod.inspectProjectBoundaryToolCall({ toolName: 'read', input: { path: '.\\existing.txt' } }, { cwd: 'Z:\\project' }, adapter), undefined);
    for (const target of ['.\\new\\child.txt', 'dir\\..\\child.txt', 'dir\\\\child.txt', 'Z:child.txt', '\\project\\child.txt']) {
      assert.equal(mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: target } }, { cwd: 'Z:\\project' }, adapter), undefined, target);
    }
    for (const target of ['\\child.txt', 'C:\\outside.txt']) {
      const outside = mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: target } }, { cwd: 'Z:\\project' }, adapter);
      assert.match(outside?.reason || '', /outside-project-or-pidex\/comparison/, target);
    }
  });

  const posixEntries = new Map([['/project', { kind: 'directory', canonical: '/project' }]]);
  const posixAdapter = {
    platform: 'linux', pathApi: path.posix,
    lstatSync(value) { const entry = posixEntries.get(value); if (!entry) throw missingPath(); return { isDirectory: () => entry.kind === 'directory' }; },
    realpathNative(value) { const entry = posixEntries.get(value); if (!entry?.canonical) throw Object.assign(new Error('unresolvable'), { code: 'EACCES' }); return entry.canonical; },
  };
  for (const value of ['child:stream', 'child.', 'child ']) {
    assert.equal(mod.resolveProjectBoundaryPathIdentity(value, '/project', 'prospective-write', posixAdapter).tag, 'success', value);
  }
});

test('project boundary retains mapped and UNC PIDEX read and write parity', () => {
  const entries = new Map([
    ['z:\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
    ['z:\\pidex', { kind: 'directory', canonical: '\\\\server\\share\\pidex' }],
    ['\\\\server\\share\\pidex', { kind: 'directory', canonical: '\\\\server\\share\\pidex' }],
    ['z:\\pidex\\readme.md', { kind: 'file', canonical: '\\\\server\\share\\pidex\\README.md' }],
    ['\\\\server\\share\\pidex\\readme.md', { kind: 'file', canonical: '\\\\server\\share\\pidex\\README.md' }],
  ]);
  const adapter = win32Evidence(entries);
  for (const [pidexRoot, targetRoot] of [['Z:\\pidex', '\\\\server\\share\\pidex'], ['\\\\server\\share\\pidex', 'Z:\\pidex']]) {
    withProjectBoundary({ active: true, projectRoot: 'Z:\\project', pidexRoot, startedCwd: 'Z:\\project' }, () => {
      assert.equal(mod.inspectProjectBoundaryToolCall({ toolName: 'read', input: { path: `${targetRoot}\\README.md` } }, { cwd: 'Z:\\project' }, adapter), undefined, `${pidexRoot} read`);
      assert.equal(mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: `${targetRoot}\\state\\runs\\run.json` } }, { cwd: 'Z:\\project' }, adapter), undefined, `${pidexRoot} runtime write`);
      const denied = mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: `${targetRoot}\\notes.txt` } }, { cwd: 'Z:\\project' }, adapter);
      assert.match(denied?.reason || '', /outside-project-or-pidex\/comparison/, `${pidexRoot} non-runtime write`);
    });
  }
});

test('project boundary blocks raw-sensitive aliases even when lexical normalization is safe', () => {
  const entries = new Map([
    ['z:\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
    ['z:\\pidex', { kind: 'directory', canonical: '\\\\server\\share\\pidex' }],
  ]);
  const adapter = win32Evidence(entries);
  withProjectBoundary({ active: true, projectRoot: 'Z:\\project', pidexRoot: 'Z:\\pidex', startedCwd: 'Z:\\project' }, () => {
    const result = mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: 'secrets\\..\\child.txt' } }, { cwd: 'Z:\\project' }, adapter);
    assert.match(result?.reason || '', /raw-path: sensitive-path\/raw-policy/);
  });
});

test('Win32 identity fails closed for strict namespace, evidence, and prospective-component matrix', () => {
  const entries = new Map([
    ['z:\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
    ['\\\\server\\share\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
    ['\\\\?\\c:\\project', { kind: 'directory', canonical: '\\\\?\\UNC\\server\\share\\project' }],
    ['\\\\?\\unc\\server\\share\\project', { kind: 'directory', canonical: '\\\\?\\UNC\\server\\share\\project' }],
    ['\\\\?\\globalroot\\device\\harddiskvolume1\\project', { kind: 'directory', canonical: '\\\\?\\GLOBALROOT\\Device\\HarddiskVolume1\\project' }],
  ]);
  const adapter = win32Evidence(entries);
  entries.set('c:\\project', { kind: 'directory', canonical: '\\\\?\\UNC\\server\\share\\project' });
  entries.set('\\\\server\\share\\project', { kind: 'directory', canonical: '\\\\?\\UNC\\server\\share\\project' });
  const assertFailure = (value, purpose, category, stage) => {
    const result = mod.resolveProjectBoundaryPathIdentity(value, 'Z:\\project', purpose, adapter);
    assert.deepEqual(result, { tag: 'failure', category, stage }, value);
  };

  for (const value of ['Z:\\project', '\\\\server\\share\\project', '\\\\?\\C:\\project', '\\\\?\\UNC\\server\\share\\project']) {
    const result = mod.resolveProjectBoundaryPathIdentity(value, 'Z:\\project', 'existing-root', adapter);
    assert.equal(result.tag, 'success', value);
    assert.equal(result.canonicalPath, '\\\\server\\share\\project', value);
  }
  for (const value of ['\\\\.\\pipe\\pidex', '\\??\\C:\\project', '\\\\?\\GLOBALROOT\\Device\\HarddiskVolume1\\project', '\\\\?\\Volume{abc}\\project', '\\\\server']) {
    assertFailure(value, 'existing-root', 'unsupported-namespace', 'namespace-classification');
  }
  for (const value of ['NUL', 'aux.txt', 'COM1 ', 'child. ', 'child.', 'file.txt:secret']) {
    assertFailure(`Z:\\project\\missing\\${value}\\leaf.txt`, 'prospective-write', 'invalid-prospective-segment', 'remainder-validation');
  }
  assertFailure('Z:\\project\\missing\\bad\0\\leaf.txt', 'prospective-write', 'invalid-input', 'lexicalization');
  for (const code of ['EACCES', 'EPERM', 'EIO']) {
    entries.set(`z:\\project\\${code.toLowerCase()}`, { kind: 'directory', lstatError: code });
    assertFailure(`Z:\\project\\${code.toLowerCase()}\\child.txt`, 'prospective-write', 'permission-io-denial', 'evidence-probe');
  }
  assertFailure('Z:\\missing', 'existing-root', 'absent-required-root', 'evidence-probe');
  assertFailure('Z:\\missing', 'existing-target', 'absent-required-target', 'evidence-probe');
  assertFailure('Y:\\missing', 'prospective-write', 'root-exhaustion', 'evidence-probe');
  entries.set('z:\\project\\broken', { kind: 'file', symbolicLink: true, realpathError: 'ENOENT' });
  entries.set('z:\\project\\unresolvable', { kind: 'file', realpathError: 'EACCES' });
  entries.set('z:\\project\\file-parent', { kind: 'file' });
  assertFailure('Z:\\project\\broken', 'existing-target', 'broken-link', 'native-realpath');
  assertFailure('Z:\\project\\unresolvable', 'existing-target', 'existing-but-unresolvable', 'native-realpath');
  assertFailure('Z:\\project\\file-parent\\child.txt', 'prospective-write', 'non-directory-ancestor', 'evidence-probe');
});

test('project boundary keeps canonical containment and policy fail-closed without topology disclosure', () => {
  const entries = new Map([
    ['z:\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
    ['z:\\pidex', { kind: 'directory', canonical: '\\\\server\\share\\pidex' }],
    ['z:\\project\\in.txt', { kind: 'file', canonical: '\\\\server\\share\\project\\in.txt' }],
    ['z:\\project\\escape.txt', { kind: 'file', canonical: '\\\\server\\other\\escape.txt' }],
    ['z:\\projectx\\sibling.txt', { kind: 'file', canonical: '\\\\server\\share\\projectx\\sibling.txt' }],
    ['z:\\project\\junction.txt', { kind: 'file', symbolicLink: true, canonical: '\\\\server\\other\\junction.txt' }],
    ['z:\\project\\safe.txt', { kind: 'file', canonical: '\\\\server\\share\\project\\.env' }],
    ['z:\\project\\.env', { kind: 'file', canonical: '\\\\server\\share\\project\\.env' }],
    ['z:\\pidex\\readme.md', { kind: 'file', canonical: '\\\\server\\share\\pidex\\README.md' }],
    ['z:\\pidex\\state\\runs\\run.json', { kind: 'missing' }],
    ['z:\\pidex\\notes.txt', { kind: 'missing' }],
  ]);
  const adapter = win32Evidence(entries);
  const boundary = { active: true, projectRoot: 'Z:\\project', pidexRoot: 'Z:\\pidex', startedCwd: 'Z:\\project' };
  withProjectBoundary(boundary, () => {
    assert.equal(mod.inspectProjectBoundaryToolCall({ toolName: 'read', input: { path: 'Z:\\project\\in.txt' } }, { cwd: 'Z:\\project' }, adapter), undefined);
    assert.equal(mod.inspectProjectBoundaryToolCall({ toolName: 'read', input: { path: 'Z:\\pidex\\README.md' } }, { cwd: 'Z:\\project' }, adapter), undefined);
    assert.equal(mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: 'Z:\\pidex\\state\\runs\\run.json' } }, { cwd: 'Z:\\project' }, adapter), undefined);
    for (const target of ['Z:\\project\\escape.txt', 'Z:\\projectx\\sibling.txt', 'Z:\\project\\junction.txt', 'Z:\\project\\safe.txt', 'Z:\\project\\.env']) {
      const result = mod.inspectProjectBoundaryToolCall({ toolName: 'read', input: { path: target } }, { cwd: 'Z:\\project' }, adapter);
      assert.equal(result?.block, true, target);
      assert.doesNotMatch(result?.reason || '', /server|share|target=|root=/i, target);
    }
    const pidexWrite = mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: 'Z:\\pidex\\notes.txt' } }, { cwd: 'Z:\\project' }, adapter);
    assert.equal(pidexWrite?.block, true);
    assert.match(pidexWrite?.reason || '', /outside-project-or-pidex\/comparison/);
  });
});

test('project boundary names every root and target evidence failure without canonical path disclosure', () => {
  const cases = [
    ['project-root unavailable', 'Z:\\project', 'Z:\\pidex', 'Z:\\project\\in.txt', 'existing-but-unresolvable', 'project-root'],
    ['pidex-root unavailable', 'Z:\\project', 'Z:\\pidex', 'Z:\\project\\in.txt', 'existing-but-unresolvable', 'pidex-root'],
    ['existing target unavailable', 'Z:\\project', 'Z:\\pidex', 'Z:\\project\\in.txt', 'existing-but-unresolvable', 'target-path'],
    ['prospective ancestor unavailable', 'Z:\\project', 'Z:\\pidex', 'Z:\\project\\new\\child.txt', 'existing-but-unresolvable', 'target-path'],
    ['project-root native mismatch', 'Z:\\project', 'Z:\\pidex', 'Z:\\project\\in.txt', 'canonical-mismatch', 'project-root'],
    ['pidex-root native mismatch', 'Z:\\project', 'Z:\\pidex', 'Z:\\project\\in.txt', 'canonical-mismatch', 'pidex-root'],
    ['target native mismatch', 'Z:\\project', 'Z:\\pidex', 'Z:\\project\\in.txt', 'canonical-mismatch', 'target-path'],
  ];
  for (const [label, projectRoot, pidexRoot, target, category, pathForm] of cases) {
    const entries = new Map([
      ['z:\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
      ['z:\\pidex', { kind: 'directory', canonical: '\\\\server\\share\\pidex' }],
      ['z:\\project\\in.txt', { kind: 'file', canonical: '\\\\server\\share\\project\\in.txt' }],
      ['z:\\project\\new', { kind: 'directory', canonical: '\\\\server\\share\\project\\new' }],
    ]);
    if (label.startsWith('project-root unavailable')) entries.get('z:\\project').realpathError = 'EACCES';
    if (label.startsWith('pidex-root unavailable')) entries.get('z:\\pidex').realpathError = 'EACCES';
    if (label.startsWith('existing target unavailable')) entries.get('z:\\project\\in.txt').realpathError = 'EACCES';
    if (label.startsWith('prospective ancestor unavailable')) entries.get('z:\\project\\new').realpathError = 'EACCES';
    if (label.startsWith('project-root native mismatch')) entries.get('z:\\project').canonical = '\\\\?\\GLOBALROOT\\Device\\HarddiskVolume1\\project';
    if (label.startsWith('pidex-root native mismatch')) entries.get('z:\\pidex').canonical = '\\\\?\\GLOBALROOT\\Device\\HarddiskVolume1\\pidex';
    if (label.startsWith('target native mismatch')) entries.get('z:\\project\\in.txt').canonical = '\\\\?\\GLOBALROOT\\Device\\HarddiskVolume1\\in.txt';
    const adapter = win32Evidence(entries);
    withProjectBoundary({ active: true, projectRoot, pidexRoot, startedCwd: 'Z:\\project' }, () => {
      const toolName = label.startsWith('prospective') ? 'write' : 'read';
      const result = mod.inspectProjectBoundaryToolCall({ toolName, input: { path: target } }, { cwd: 'Z:\\project' }, adapter);
      assert.equal(result?.block, true, label);
      assert.match(result?.reason || '', new RegExp(`${pathForm}: ${category}`), label);
      assert.doesNotMatch(result?.reason || '', /server|share|harddiskvolume/i, label);
    });
  }
});

test('project boundary fails closed for unsupported namespaces and unresolvable prospective ancestors', () => {
  const entries = new Map([
    ['z:\\project', { kind: 'directory', canonical: '\\\\server\\share\\project' }],
    ['z:\\pidex', { kind: 'directory', canonical: '\\\\server\\share\\pidex' }],
    ['z:\\project\\blocked', { kind: 'file' }],
  ]);
  const adapter = win32Evidence(entries);
  const boundary = { active: true, projectRoot: 'Z:\\project', pidexRoot: 'Z:\\pidex', startedCwd: 'Z:\\project' };
  withProjectBoundary(boundary, () => {
    const device = mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: '\\\\.\\pipe\\escape' } }, { cwd: 'Z:\\project' }, adapter);
    assert.match(device?.reason || '', /unsupported-namespace\/namespace-classification/);
    const ancestor = mod.inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: 'Z:\\project\\blocked\\child.txt' } }, { cwd: 'Z:\\project' }, adapter);
    assert.match(ancestor?.reason || '', /non-directory-ancestor\/evidence-probe/);
  });
});
