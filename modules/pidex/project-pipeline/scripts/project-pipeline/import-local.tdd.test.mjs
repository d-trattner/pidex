import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyImportPath, collectImportFiles, importLocalProject } from './import-local.mjs';
import { createProjectRecord, saveProjectRecord, loadProjectRecord } from './registry.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-import-')); }
function write(file, text) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }

test('classifyImportPath blocks runtime and secret paths', () => {
  assert.equal(classifyImportPath('src/app.js').ok, true);
  for (const rel of ['.git/config', 'node_modules/x/index.js', 'agents.output/plan.md', '.env', 'secret.pem', '../x']) {
    assert.equal(classifyImportPath(rel).ok, false, rel);
  }
});

test('collectImportFiles uses git exclude-standard and blocks secrets', () => {
  const project = tmp();
  git(project, ['init']);
  git(project, ['config', 'user.email', 'test@example.com']);
  git(project, ['config', 'user.name', 'Test']);
  write(path.join(project, 'src/app.js'), 'console.log(1)\n');
  write(path.join(project, '.env'), 'SECRET=1\n');
  write(path.join(project, '.gitignore'), '.env\nignored.txt\n');
  write(path.join(project, 'ignored.txt'), 'ignored\n');
  write(path.join(project, 'README.md'), '# ok\n');
  git(project, ['add', 'README.md', 'src/app.js', '.gitignore']);
  git(project, ['commit', '-m', 'init']);
  write(path.join(project, 'notes.txt'), 'untracked nonignored\n');
  const result = collectImportFiles(project);
  assert.deepEqual(result.files.map((item) => item.path).sort(), ['.gitignore', 'README.md', 'notes.txt', 'src/app.js'].sort());
});

test('importLocalProject copies accepted files to container workspace and updates registry', () => {
  const root = tmp();
  const source = tmp();
  write(path.join(source, 'README.md'), '# ok\n');
  write(path.join(source, 'src/app.js'), 'console.log(1)\n');
  write(path.join(source, '.env'), 'SECRET=1\n');
  const record = createProjectRecord({ project_id: 'pp-import-abc123', name: 'demo' });
  record.status = 'ready';
  saveProjectRecord(root, record);
  const calls = [];
  const result = importLocalProject({ pidexRoot: root, projectId: 'pp-import-abc123', source, runner: (args) => { calls.push(args); return 'ok'; } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.copied.map((item) => item.path), ['README.md', 'src/app.js']);
  assert.equal(calls.some((args) => args[0] === 'cp' && String(args[2]).endsWith(':/workspace/README.md')), true);
  assert.equal(calls.some((args) => String(args).includes('.env')), false);
  const loaded = loadProjectRecord(root, 'pp-import-abc123');
  assert.equal(loaded.source.kind, 'host-path');
  assert.equal(loaded.source.files_copied, 2);
});
