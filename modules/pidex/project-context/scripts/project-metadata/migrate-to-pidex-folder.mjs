#!/usr/bin/env node
// Migrate project-local PIDEX metadata out of wiki/ and into pidex/.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TARGET_DIRS = ['pidex/rules', 'pidex/state', 'pidex/config', 'pidex/prompts'];
function rel(project, file) { return path.relative(project, file).replaceAll(path.sep, '/'); }
function uniquePath(file) { if (!existsSync(file)) return file; const parent = path.dirname(file); const stem = path.basename(file); for (let i = 1; i < 1000; i++) { const c = path.join(parent, `${stem}.${i}`); if (!existsSync(c)) return c; } throw new Error(`could not find unique archive path for ${file}`); }
function sameFileBytes(a, b) { try { return statSync(a).isFile() && statSync(b).isFile() && readFileSync(a).equals(readFileSync(b)); } catch { return false; } }
function walkFiles(dir) { const out = []; for (const entry of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); if (entry.isDirectory()) out.push(...walkFiles(p)); else if (entry.isFile()) out.push(p); } return out.sort(); }
function copyDirNoOverwrite(src, dst, errors, planned, dryRun, project) { for (const item of walkFiles(src)) { const relItem = path.relative(src, item); const target = path.join(dst, relItem); planned.push({ action: 'copy', from: rel(project, item), to: rel(project, target) }); if (existsSync(target) && !sameFileBytes(item, target)) { errors.push(`conflict: ${rel(project, target)} exists with different content`); continue; } if (!dryRun) { mkdirSync(path.dirname(target), { recursive: true }); if (!existsSync(target)) copyFileSync(item, target); } } }
function expandHome(value) { return String(value).replace(/^~(?=$|[\\/])/, process.env.HOME || ''); }
function migrateProject(projectArg, dryRun) {
  const project = path.resolve(expandHome(projectArg));
  const stamp = new Date().toISOString().slice(0, 10);
  const archiveRoot = path.join(project, '.wiki-migration', 'archive', stamp, 'pidex-metadata');
  const result = { ok: true, project, dry_run: dryRun, created_dirs: [], migrations: [], warnings: [], errors: [] };
  if (!existsSync(project)) { result.ok = false; result.errors.push('project root does not exist'); return result; }
  for (const d of TARGET_DIRS) { const p = path.join(project, d); if (!existsSync(p)) { result.created_dirs.push(d); if (!dryRun) mkdirSync(p, { recursive: true }); } }
  const legacyRules = path.join(project, 'wiki', 'rules'); const targetRules = path.join(project, 'pidex', 'rules');
  if (existsSync(legacyRules)) { if (!statSync(legacyRules).isDirectory()) result.errors.push('wiki/rules exists but is not a directory'); else { copyDirNoOverwrite(legacyRules, targetRules, result.errors, result.migrations, dryRun, project); const archiveRules = uniquePath(path.join(archiveRoot, 'wiki-rules')); result.migrations.push({ action: 'archive', from: 'wiki/rules', to: rel(project, archiveRules) }); if (!dryRun && !result.errors.length) { mkdirSync(path.dirname(archiveRules), { recursive: true }); renameSync(legacyRules, archiveRules); } } }
  else result.warnings.push('no legacy wiki/rules directory');
  const legacyState = path.join(project, 'wiki', '.hygiene-state.json'); const targetState = path.join(project, 'pidex', 'state', 'wiki-hygiene.json');
  if (existsSync(legacyState)) { if (!statSync(legacyState).isFile()) result.errors.push('wiki/.hygiene-state.json exists but is not a file'); else if (existsSync(targetState) && !sameFileBytes(legacyState, targetState)) result.errors.push('conflict: pidex/state/wiki-hygiene.json exists with different content'); else { result.migrations.push({ action: 'copy', from: 'wiki/.hygiene-state.json', to: 'pidex/state/wiki-hygiene.json' }); const archiveState = uniquePath(path.join(archiveRoot, 'hygiene-state.json')); result.migrations.push({ action: 'archive', from: 'wiki/.hygiene-state.json', to: rel(project, archiveState) }); if (!dryRun) { mkdirSync(path.dirname(targetState), { recursive: true }); if (!existsSync(targetState)) copyFileSync(legacyState, targetState); mkdirSync(path.dirname(archiveState), { recursive: true }); renameSync(legacyState, archiveState); } } }
  else result.warnings.push('no legacy wiki/.hygiene-state.json');
  if (result.errors.length) result.ok = false;
  return result;
}
function parse(argv) { const args = { dryRun: false, projects: [] }; for (const a of argv) { if (a === '--dry-run') args.dryRun = true; else if (a === '--json') {} else args.projects.push(a); } if (!args.projects.length) { console.error('usage: migrate-to-pidex-folder.mjs [--dry-run] [--json] <project>...'); process.exit(2); } return args; }
const args = parse(process.argv.slice(2));
const results = args.projects.map((p) => migrateProject(p, args.dryRun));
const payload = { ok: results.every((r) => r.ok), dry_run: args.dryRun, projects: results };
console.log(JSON.stringify(payload, null, 2));
process.exitCode = payload.ok ? 0 : 1;
