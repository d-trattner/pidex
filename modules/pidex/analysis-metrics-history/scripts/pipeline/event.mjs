#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function rootFromScript() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'); }
function slug(value) { return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown'; }
function normalizePlan(value) { const s = String(value || '').trim(); let m = s.match(/^(?:plan-)?(\d{1,3})$/i); if (m) return `plan-${m[1].padStart(3, '0')}`; m = s.match(/^(?:plan-)?(\d{1,3})[-_]/i); if (m) return `plan-${m[1].padStart(3, '0')}`; return s || 'unknown-plan'; }
function timestampId() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function parse(argv) {
  const out = { root: rootFromScript(), stateDir: process.env.RUNNING_PI_STATE_DIR || '', project: '', projectSlug: '', pipelineId: process.env.RUNNING_PI_PIPELINE_ID || '', plan: 'unknown-plan', event: '', status: '', actor: 'orchestrator', message: '', source: 'manual', metadataJson: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const v = () => argv[++i] || '';
    if (a === '--project') out.project = v(); else if (a === '--state-dir') out.stateDir = v(); else if (a === '--project-slug' || a === '--slug') out.projectSlug = v(); else if (a === '--pipeline-id') out.pipelineId = v(); else if (a === '--plan') out.plan = v(); else if (a === '--event' || a === '--event-type') out.event = v(); else if (a === '--status') out.status = v(); else if (a === '--actor') out.actor = v(); else if (a === '--message') out.message = v(); else if (a === '--source') out.source = v(); else if (a === '--metadata-json') out.metadataJson = v(); else if (a === '-h' || a === '--help') { console.log('Usage: event.mjs --plan PLAN --event EVENT [options]'); process.exit(0); } else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  out.stateDir ||= path.join(out.root, 'state');
  if (!out.project) out.project = process.cwd();
  if (!out.event) { console.error('Missing required --event'); process.exit(2); }
  return out;
}
function runOptional(command, args, options) { try { const cp = spawnSync(command, args, options); if (cp.stdout?.trim()) console.log(cp.stdout.trim()); if (cp.status !== 0 && (cp.stderr || cp.stdout)) console.error((cp.stderr || cp.stdout).trim()); } catch (error) { console.error(`${path.basename(args[0] || command)} failed: ${error instanceof Error ? error.message : String(error)}`); } }

const args = parse(process.argv.slice(2));
const projectPath = path.resolve(args.project.replace(/^~(?=$|[\\/])/, process.env.HOME || ''));
const projectSlug = args.projectSlug || path.basename(projectPath) || slug(projectPath);
const projectSlugSafe = slug(projectSlug);
const planKey = normalizePlan(args.plan);
const planSafe = slug(planKey);
const base = path.join(args.stateDir, 'pipeline-events', projectSlugSafe);
mkdirSync(base, { recursive: true });
const currentFile = path.join(base, `${planSafe}.current`);
const terminalEvents = new Set(['pipeline_completed', 'pipeline_failed', 'pipeline_aborted', 'pipeline_cancelled']);
let pipelineId = args.pipelineId;
if (!pipelineId) {
  if (args.event === 'pipeline_started') {
    pipelineId = slug(`${projectSlugSafe}-${planSafe}-${timestampId()}`);
    writeFileSync(currentFile, pipelineId, 'utf8');
  } else if (existsSync(currentFile)) {
    pipelineId = readFileSync(currentFile, 'utf8').trim();
    if (!pipelineId) { console.error(`Active pipeline id file is empty for project=${projectSlugSafe} plan=${planKey}: ${currentFile}`); process.exit(1); }
  } else if (terminalEvents.has(args.event)) {
    console.error(`Terminal event ${args.event} for project=${projectSlugSafe} plan=${planKey} has no active pipeline id. Pass --pipeline-id explicitly or emit pipeline_started first; refusing to create an orphan terminal pipeline.`);
    process.exit(1);
  } else {
    pipelineId = slug(`${projectSlugSafe}-${planSafe}-${timestampId()}`);
    writeFileSync(currentFile, pipelineId, 'utf8');
  }
} else {
  pipelineId = slug(pipelineId);
  if (args.event === 'pipeline_started') writeFileSync(currentFile, pipelineId, 'utf8');
}
let metadata = null;
if (args.metadataJson) {
  try { metadata = JSON.parse(args.metadataJson); } catch (error) { console.error(`Invalid --metadata-json: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) { console.error('--metadata-json must be a JSON object'); process.exit(1); }
}
const record = { timestamp: new Date().toISOString(), project_path: projectPath, project_slug: projectSlug, pipeline_id: pipelineId, plan_key: planKey, event_type: args.event, status: args.status || null, actor: args.actor || null, message: args.message || null, metadata, source: args.source || null };
const outPath = path.join(base, `${pipelineId}.jsonl`);
writeFileSync(outPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
if (terminalEvents.has(args.event) && existsSync(currentFile)) { try { if (readFileSync(currentFile, 'utf8').trim() === pipelineId) unlinkSync(currentFile); } catch {} }
console.log(`${outPath} pipeline_id=${pipelineId}`);
if (terminalEvents.has(args.event) && process.env.PIDEX_PIPELINE_EVENT_RUN_OPTIONAL_HOOKS === '1') {
  if (!['0', 'false', 'no', 'off'].includes(String(process.env.PIDEX_AUTO_PDQ || '1').toLowerCase())) {
    const script = path.join(args.root, 'scripts', 'quality', 'run-auto-pdq.mjs');
    if (existsSync(script)) runOptional(process.execPath, [script, '--project', projectPath, '--plan', planKey, '--pipeline-id', pipelineId, '--terminal-event', args.event], { cwd: args.root, encoding: 'utf8', timeout: Number(process.env.PIDEX_AUTO_PDQ_TIMEOUT_SECONDS || 120) * 1000 });
  }
  const hygiene = path.join(args.root, 'scripts', 'wiki', 'hygiene.mjs');
  if (existsSync(hygiene)) runOptional(process.execPath, [hygiene, 'cadence', '--project', projectPath, '--plan', planKey, '--pipeline-id', pipelineId, '--terminal-event', args.event], { cwd: args.root, encoding: 'utf8', timeout: Number(process.env.PIDEX_WIKI_HYGIENE_CADENCE_TIMEOUT_SECONDS || 30) * 1000 });
}
