#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, scriptPidexRoot } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage: node scripts/modules/reference-guard.mjs [--mode warn|fail] [--pidex-root <path>]\n\nScans tracked caller files for forbidden hard-coded PIDEX module implementation paths.\nPhysical module script paths belong in module manifests and internals, thin compatibility wrappers, module framework/validation harnesses, or tracked external-evidence Markdown under ext/claude-code-reviews/ and ext/reports/ only.`);
  process.exit(0);
}

const mode = args.mode || 'fail';
if (!['warn', 'fail'].includes(mode)) {
  console.error('--mode must be warn or fail');
  process.exit(2);
}
const root = args['pidex-root'] ? path.resolve(String(args['pidex-root'])) : scriptPidexRoot(import.meta.url);
const moduleScriptPattern = /modules\/pidex\/[A-Za-z0-9_.-]+\/scripts\/[A-Za-z0-9_./-]+/g;
const modulePathTokenPattern = /modules\/pidex\//;
const moduleScriptsTokenPattern = /\/scripts\//;
const stableModuleLibraryPattern = /modules\/pidex\/[A-Za-z0-9_.-]+\/lib\/[A-Za-z0-9_./-]+/g;
const legacyWrapperPattern = /(?:^|[^A-Za-z0-9_./-])scripts\/(?:release|parallel-agents|git-hooks|provider-limits|profile|project-context|project-metadata|wiki|compat|analysis|metrics|history|pipeline)\/[A-Za-z0-9_./-]+/g;
const plan049Capability = 'process-rules.plan049-passive-exposure-platform';
const plan049PointerStatePatterns = [
  /B implemented — CMD-1 locked pending independent technical\/process\/safety\/QA verdicts and immutable-coordinate approval/,
  /T-1 reached:\s*pushed SHA \x60?[0-9a-f]{40}/,
  /T-2 reached:\s*Linux passed at SHA \x60?[0-9a-f]{40}/,
  /Plan049 T-3 passed:\s*Linux and native Windows each passed once, 73\/73, at correction SHA \x60?[0-9a-f]{40}/,
  /Plan049 T-3 passed at (?:correction )?(?:SHA )?\x60?[0-9a-f]{40}\x60?:\s*Linux and native Windows each passed (?:exactly )?once, 73\/73/,
  /ELIGIBLE FOR IMMUTABLE-COORDINATE APPROVAL PLANNING[\s\S]{0,240}Git\/CMD-1\/native\/release authority remains locked/,
  /T-3 blocked at immutable SHA \x60?[0-9a-f]{40}\x60?\./,
  /Plan049 lifecycle reviewed:\s*code review, security, and QA accepted at SHA \x60?[0-9a-f]{40}/,
];
const plan049PointerFiles = new Set([
  'wiki/roadmap.md', 'wiki/status.md', 'wiki/initiatives/011-quality-rule-learning/index.md', 'wiki/initiatives/011-quality-rule-learning/plan-049-crash-safe-passive-exposure-foundation.md',
  'agents.output/planning/049-crash-safe-passive-exposure-foundation.md', 'agents.output/planning/049-crash-safe-passive-exposure-execution-slices.md', 'agents.output/planning/049-c49-5-run-check-capability-reset.md',
  'agents.output/planning/049-c49-5-direct-windows-evidence-reset.md', 'agents.output/planning/049-c49-5-windows-concurrency-test-and-ise-capture-correction.md', 'agents.output/devops/049-native-windows-validation-lane.md', 'agents.output/qa/049-windows-validation/README.md', 'agents.output/analysis/049-windows-evidence-worksheet-runaway-incident.md',
]);
const plan049RetiredReference = /Invoke-Plan049WindowsValidation|plan049-c49-5-ise-worksheet|plan049-direct-windows-evidence-worksheet|plan049-uc1-probe/;
const plan049Alias = /process-rules\.(?!plan049-passive-exposure-platform\b)[A-Za-z0-9._-]*passive-exposure-platform\b/;

function hasPlan049PointerState(text) {
  if (text.includes('RETIRED_UNSAFE — HISTORICAL — DO NOT EXECUTE')) return true;
  const active = text.split('\n').find((line) => /^> (?:Current Plan049|Plan049 T-3)/.test(line)) || text;
  const matchingStates = plan049PointerStatePatterns.filter((pattern) => pattern.test(active));
  const shas = new Set([...active.matchAll(/\b[a-f0-9]{40}\b/g)].map((match) => match[0]));
  return matchingStates.length === 1 && shas.size <= 1;
}

function parseIndexRecord(record, seen, previous) {
  const separator = record.indexOf(9);
  if (separator < 1) throw new Error('Malformed git index record');
  const metadata = record.subarray(0, separator); const fileBytes = record.subarray(separator + 1);
  if (!fileBytes.length || !metadata.every((byte) => byte < 128)) throw new Error('Malformed git index record');
  const match = /^(?<mode>[0-7]{6}) (?:[0-9a-f]{40}|[0-9a-f]{64}) 0$/.exec(metadata.toString('ascii'));
  const key = fileBytes.toString('hex');
  if (!match || seen.has(key) || (previous && Buffer.compare(previous, fileBytes) >= 0)) throw new Error('Malformed git index record');
  seen.add(key);
  try { return { entry: { file: new TextDecoder('utf-8', { fatal: true }).decode(fileBytes), mode: match.groups.mode }, fileBytes }; }
  catch { throw new Error(`invalid UTF-8 tracked candidate: ${JSON.stringify(fileBytes.toString('hex'))}`); }
}

function gitFiles() {
  const proc = spawnSync('git', ['ls-files', '--stage', '-z'], { cwd: root });
  if (proc.error || proc.status !== 0 || !Buffer.isBuffer(proc.stdout)) throw new Error('git ls-files --stage failed');
  const output = proc.stdout;
  if (!output.length) return [];
  if (output.at(-1) !== 0) throw new Error('Malformed git index output');
  const entries = []; const seen = new Set(); let previous; let offset = 0;
  while (offset < output.length) {
    const end = output.indexOf(0, offset);
    if (end === offset) throw new Error('Malformed git index output');
    const parsed = parseIndexRecord(output.subarray(offset, end), seen, previous);
    previous = parsed.fileBytes; if (parsed.entry) entries.push(parsed.entry);
    offset = end + 1;
  }
  return entries;
}

function renderPathname(file) {
  return JSON.stringify(file);
}

function checkedTrackedPath(file) {
  const abs = path.resolve(root, file); const relative = path.relative(root, abs);
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`unsafe tracked path: ${renderPathname(file)}`);
  return abs;
}

function isLikelyText(file) {
  return /\.(?:md|mdx|txt|json|jsonc|mjs|js|ts|tsx|sh|ps1|yml|yaml|toml|html|css|gitignore)$/.test(file)
    || ['README', 'LICENSE', 'CHANGELOG', 'CONTRIBUTING', 'install.sh', 'uninstall.sh', 'package.json'].some((name) => file.endsWith(name));
}

function isModuleInternal(file) {
  return file.startsWith('modules/pidex/');
}

function isCompatibilityWrapper(file, text) {
  if (!file.startsWith('scripts/')) return false;
  if (file.startsWith('scripts/modules/')) return false;
  if (file.includes('.tdd.test.')) return true;
  const lines = text.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#') && !line.trim().startsWith('//'));
  return lines.length <= 10 && /modules\/pidex\//.test(text) && /(exec\s+|await import\(|const target = path\.join\(|spawnSync\()/m.test(text);
}

function isModuleFramework(file) {
  return file.startsWith('scripts/modules/');
}

function isModuleFrameworkTest(file) {
  return isModuleFramework(file) && (file.endsWith('.tdd.test.mjs') || file.endsWith('test-helpers.mjs'));
}

function isValidationHarness(file) {
  return file === 'package.json' || file === 'scripts/release/public-readiness-check.mjs';
}

function isExternalEvidenceMarkdown(file, mode) {
  return mode === '100644' && file.endsWith('.md') && (file.startsWith('ext/claude-code-reviews/') || file.startsWith('ext/reports/'));
}

function isGeneratedOrBinary(file) {
  return file.startsWith('agents.output/') || file.includes('__pycache__/') || file.endsWith('.pyc') || file.endsWith('dashboard/app/routeTree.gen.ts');
}

const moduleViolations = [];
const legacyWarnings = [];
const plan049Violations = [];
const trackedText = new Map();
for (const { file, mode } of gitFiles()) {
  if ((isGeneratedOrBinary(file) && !plan049PointerFiles.has(file)) || !isLikelyText(file)) continue;
  const abs = checkedTrackedPath(file);
  let text;
  try {
    if (!lstatSync(abs).isFile()) throw new Error('not regular');
    text = readFileSync(abs, 'utf8');
  } catch { throw new Error(`tracked text checkout is not regular: ${renderPathname(file)}`); }
  trackedText.set(file, text);
  if (!file.endsWith('.tdd.test.mjs')) {
    if (plan049Alias.test(text)) plan049Violations.push(`${renderPathname(file)}: Plan049 capability alias`);
    if (plan049RetiredReference.test(text) && !text.includes('RETIRED_UNSAFE — HISTORICAL — DO NOT EXECUTE')) plan049Violations.push(`${renderPathname(file)}: retired external reference lacks terminal marker`);
    if (text.includes(plan049Capability) && /route_to:\s*(?:user|custom[-_]?runner|worksheet)\b/.test(text)) plan049Violations.push(`${renderPathname(file)}: unsafe Plan049 active reference`);
    const evidenceRead = /readFileSync\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)/.exec(text);
    if (evidenceRead && new RegExp(`appendFileSync\\(\\s*${evidenceRead[1]}\\b`).test(text)) plan049Violations.push(`${renderPathname(file)}: same-path evidence read/append`);
  }

  const moduleMatches = [...text.matchAll(moduleScriptPattern)].map((match) => match[0]);
  const constructedPathScanText = text.replaceAll(stableModuleLibraryPattern, '');
  const hasConstructedModuleScriptPath = modulePathTokenPattern.test(constructedPathScanText) && moduleScriptsTokenPattern.test(constructedPathScanText);
  if (moduleMatches.length || hasConstructedModuleScriptPath) {
    const allowed = isModuleInternal(file) || isCompatibilityWrapper(file, text) || isModuleFramework(file) || isValidationHarness(file) || isExternalEvidenceMarkdown(file, mode);
    if (!allowed) {
      const matches = moduleMatches.length ? [...new Set(moduleMatches)] : ['constructed modules/pidex/*/scripts/* path tokens'];
      moduleViolations.push({ file, matches });
    }
  }

  const legacyMatches = [...text.matchAll(legacyWrapperPattern)]
    .map((match) => match[0].replace(/^[^A-Za-z0-9_./-]/, ''))
    .filter((item) => !item.includes('__pycache__'));
  if (legacyMatches.length && !file.startsWith('scripts/') && !file.startsWith('modules/pidex/')) {
    legacyWarnings.push({ file, matches: [...new Set(legacyMatches)] });
  }
}

if (legacyWarnings.length) {
  console.error(`module reference guard: ${legacyWarnings.length} tracked file(s) still mention legacy wrapper paths; treat as compatibility/docs or migrate to capability IDs over time`);
  for (const item of legacyWarnings.slice(0, 50)) console.error(`warning: ${renderPathname(item.file)}: ${item.matches.join(', ')}`);
  if (legacyWarnings.length > 50) console.error(`warning: ... ${legacyWarnings.length - 50} more file(s)`);
}

for (const file of plan049PointerFiles) {
  if (trackedText.has(file)) continue;
  const abs = checkedTrackedPath(file);
  if (!lstatSync(abs, { throwIfNoEntry: false })?.isFile()) continue;
  trackedText.set(file, readFileSync(abs, 'utf8'));
}

if (trackedText.get('modules/pidex/process-rules/module.json')?.includes(plan049Capability)) {
  for (const file of plan049PointerFiles) {
    const text = trackedText.get(file);
    if (!text || !hasPlan049PointerState(text)) plan049Violations.push(`${renderPathname(file)}: Plan049 pointer state incomplete`);
  }
}

if (plan049Violations.length) {
  console.error('module reference guard: unsafe Plan049 references found');
  for (const violation of plan049Violations) console.error(violation);
}

if (moduleViolations.length || plan049Violations.length) {
  console.error(`module reference guard: forbidden hard-coded module implementation path(s) found`);
  for (const item of moduleViolations) console.error(`${renderPathname(item.file)}: ${item.matches.join(', ')}`);
  if (mode === 'fail') process.exit(1);
}

console.log(JSON.stringify({ ok: moduleViolations.length === 0 && plan049Violations.length === 0, mode, forbidden_module_path_files: moduleViolations.length, plan049_reference_violations: plan049Violations.length, legacy_wrapper_reference_files: legacyWarnings.length }, null, 2));
process.exit(0);
