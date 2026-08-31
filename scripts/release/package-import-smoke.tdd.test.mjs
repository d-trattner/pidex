import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyBundledBaseline } from '../quality/rule-lifecycle.mjs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeEntries = [
  'extensions/pidex/index.ts',
  'modules/pidex/project-pipeline/scripts/project-pipeline/orchestrator.mjs',
  'scripts/quality/rule-lifecycle.mjs',
  'scripts/quality/rule-impact-policy.mjs',
  'scripts/quality/rule-impact-evaluator.mjs',
  'scripts/quality/rule-impact-results.mjs',
  'scripts/quality/rule-impact-cadence.mjs',
];
const plan047PackageFiles = [
  'scripts/quality/rule-learning-contracts.mjs',
  'scripts/quality/rule-learning-aggregate.mjs',
  'scripts/quality/rule-learning-candidate.mjs',
  'scripts/quality/rule-learning-admission.mjs',
  'scripts/quality/rule-git-writer.mjs',
  'scripts/quality/rule-publication-transaction.mjs',
  'scripts/quality/rule-manual-import.mjs',
  'scripts/quality/rule-publication-status.mjs',
];
const plan047CheckTests = plan047PackageFiles.map((file) => file.replace(/^scripts\/quality\//, '').replace(/\.mjs$/, '.tdd.test.mjs'));
const plan046RuntimeFiles = [
  'scripts/quality/rule-impact-policy.mjs',
  'scripts/quality/rule-impact-evaluator.mjs',
  'scripts/quality/rule-impact-results.mjs',
  'scripts/quality/rule-impact-cadence.mjs',
];

function npmCliPath() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  return candidates.find(existsSync) || (() => { throw new Error('npm CLI not found'); })();
}
function pack(destination) {
  const result = spawnSync(process.execPath, [npmCliPath(), 'pack', '--json', '--pack-destination', destination], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout)[0];
}
function relativeImports(file) {
  const source = readFileSync(path.join(root, file), 'utf8');
  return [...source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map((match) => match[1]).filter((specifier) => specifier.startsWith('.'));
}
function resolveImport(from, specifier) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  for (const candidate of [base, `${base}.mjs`, `${base}.ts`, `${base}.tsx`, `${base}/index.mjs`, `${base}/index.ts`]) {
    if (existsSync(path.join(root, candidate))) return candidate;
  }
  throw new Error(`unresolved local import ${specifier} from ${from}`);
}
function runtimeClosure() {
  const closure = new Set(); const pending = [...runtimeEntries];
  while (pending.length) {
    const file = pending.pop();
    if (closure.has(file)) continue;
    closure.add(file);
    pending.push(...relativeImports(file).map((specifier) => resolveImport(file, specifier)));
  }
  return closure;
}

test('published tarball contains exact Plan045 runtime import closure and baseline fails closed without install', async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'pidex-package-import-'));
  try {
    const report = pack(temp);
    const shipped = new Set(report.files.map((item) => item.path));
    for (const file of runtimeClosure()) assert.ok(shipped.has(file), `packed runtime closure missing ${file}`);
    assert.deepEqual(plan046RuntimeFiles.filter((file) => shipped.has(file)), plan046RuntimeFiles, 'packed Plan046 runtime modules must match current Spawn A closure');
    assert.equal(shipped.has('state/lifecycle.sqlite'), false);
    assert.equal(shipped.has('.git/HEAD'), false);

    const tarball = path.join(temp, report.filename);
    const listed = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf8' });
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(listed.stdout.includes('package/state/'), false);

    const baselineDir = path.join(temp, 'baseline');
    mkdirSync(baselineDir);
    const extracted = spawnSync('tar', ['-xzf', tarball, '-C', baselineDir, '--strip-components=1'], { encoding: 'utf8' });
    assert.equal(extracted.status, 0, extracted.stderr);
    const baselineModule = path.join(baselineDir, 'scripts/quality/rule-lifecycle.mjs');
    for (const file of plan046RuntimeFiles) await import(pathToFileURL(path.join(baselineDir, file)).href);
    const { verifyBundledBaseline } = await import(pathToFileURL(baselineModule).href);
    const baseline = verifyBundledBaseline({ root: baselineDir });
    const memberPath = path.join(baselineDir, baseline.members[0].path);
    const original = readFileSync(memberPath);
    writeFileSync(memberPath, Buffer.concat([original, Buffer.from('x')]));
    assert.throws(() => verifyBundledBaseline({ root: baselineDir }), /RULE_BASELINE_MEMBER_DIGEST_INVALID/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('published tarball contains the complete Angular module and exactly one Angular skill entry', async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'pidex-angular-package-'));
  try {
    const report = pack(temp);
    const shipped = new Set(report.files.map((item) => item.path));
    for (const file of [
      'modules/pidex/angular/module.json',
      'modules/pidex/angular/config/source-lock.json',
      'modules/pidex/angular/lib/source-lock.mjs',
      'modules/pidex/angular/lib/workspace-inspector.mjs',
      'modules/pidex/angular/lib/verification-contract.mjs',
      'modules/pidex/angular/lib/managed-process.mjs',
      'modules/pidex/angular/lib/nx-cli.mjs',
      'modules/pidex/angular/scripts/angular/source-check.mjs',
      'modules/pidex/angular/scripts/angular/inspect.mjs',
      'modules/pidex/angular/scripts/angular/verify.mjs',
      'skills/angular-application/SKILL.md',
      'skills/angular-application/references/upstream/UPSTREAM.json',
    ]) assert.ok(shipped.has(file), `packed Angular closure missing ${file}`);
    assert.equal([...shipped].filter((file) => file.startsWith('skills/angular-application/references/') && file.endsWith('/SKILL.md')).length, 0);

    const extractedDir = path.join(temp, 'extracted'); mkdirSync(extractedDir);
    const extracted = spawnSync('tar', ['-xzf', path.join(temp, report.filename), '-C', extractedDir, '--strip-components=1'], { encoding: 'utf8' });
    assert.equal(extracted.status, 0, extracted.stderr);
    const sourceLock = await import(pathToFileURL(path.join(extractedDir, 'modules/pidex/angular/lib/source-lock.mjs')).href);
    assert.equal(sourceLock.verifyAngularSourceLock({ pidexRoot: extractedDir }).status, 'verified');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('retrospective living-rule finding producer is canonical, privacy-safe, and non-publishing', () => {
  const rulePath = 'rules/pidex-retrospective/living-rule-findings.md';
  const rule = readFileSync(path.join(root, rulePath), 'utf8');
  const index = readFileSync(path.join(root, 'rules/pidex-retrospective/index.md'), 'utf8');
  assert.match(index, /\| Living Rule Findings \| \[living-rule-findings\.md\]\(living-rule-findings\.md\) \| PLAN047 \|/);
  assert.match(rule, /pidex-rule-learning-finding-v1/);
  assert.match(rule, /schema_version.*finding_id.*producer.*completed_run_id.*plan_id.*project_scope_id.*repository_identity.*taxonomy.*affected_agent.*affected_phase.*recurrence_key.*lesson_summary.*evidence_digests.*occurred_at.*redaction_classes/s);
  assert.match(rule, /Raw prompts, source paths, credentials, secrets, and unrestricted logs are forbidden\./);
  assert.match(rule, /No publication authority\./);
  assert.equal(verifyBundledBaseline({ root }).members.some((member) => member.path === rulePath), true);
});

test('package ships Plan047 publication authority and check runs its contract suites in dependency order', () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const shipped = new Set(packageJson.files);
  for (const file of plan047PackageFiles) assert.ok(shipped.has(file), `package files missing ${file}`);

  const check = packageJson.scripts.check;
  let previous = -1;
  for (const testFile of plan047CheckTests) {
    const position = check.indexOf(`node scripts/quality/${testFile}`);
    assert.ok(position > previous, `check must run ${testFile} after its dependency`);
    previous = position;
  }
});
