#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

function gitFiles() {
  const proc = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  if (proc.status !== 0) throw new Error(proc.stderr || 'git ls-files failed');
  return proc.stdout.split('\n').filter(Boolean).sort();
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

function isExternalEvidenceMarkdown(file) {
  return file.endsWith('.md') && (file.startsWith('ext/claude-code-reviews/') || file.startsWith('ext/reports/'));
}

function isGeneratedOrBinary(file) {
  return file.startsWith('agents.output/') || file.includes('__pycache__/') || file.endsWith('.pyc') || file.endsWith('dashboard/app/routeTree.gen.ts');
}

const moduleViolations = [];
const legacyWarnings = [];
for (const file of gitFiles()) {
  if (isGeneratedOrBinary(file) || !isLikelyText(file)) continue;
  const abs = path.join(root, file);
  if (!existsSync(abs)) continue;
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }

  const moduleMatches = [...text.matchAll(moduleScriptPattern)].map((match) => match[0]);
  const constructedPathScanText = text.replaceAll(stableModuleLibraryPattern, '');
  const hasConstructedModuleScriptPath = modulePathTokenPattern.test(constructedPathScanText) && moduleScriptsTokenPattern.test(constructedPathScanText);
  if (moduleMatches.length || hasConstructedModuleScriptPath) {
    const allowed = isModuleInternal(file) || isCompatibilityWrapper(file, text) || isModuleFramework(file) || isValidationHarness(file) || isExternalEvidenceMarkdown(file);
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
  for (const item of legacyWarnings.slice(0, 50)) console.error(`warning: ${item.file}: ${item.matches.join(', ')}`);
  if (legacyWarnings.length > 50) console.error(`warning: ... ${legacyWarnings.length - 50} more file(s)`);
}

if (moduleViolations.length) {
  console.error(`module reference guard: forbidden hard-coded module implementation path(s) found`);
  for (const item of moduleViolations) console.error(`${item.file}: ${item.matches.join(', ')}`);
  if (mode === 'fail') process.exit(1);
}

console.log(JSON.stringify({ ok: moduleViolations.length === 0, mode, forbidden_module_path_files: moduleViolations.length, legacy_wrapper_reference_files: legacyWarnings.length }, null, 2));
process.exit(0);
