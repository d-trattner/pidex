#!/usr/bin/env node
// Ingest PIDEX metrics/artifacts into SQLite. Node implementation for cross-platform dashboard paths.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ANALYTICS = path.join(ROOT, 'dashboard');
const DEFAULT_DB = path.join(ANALYTICS, 'data', 'pidex.sqlite');
const PROVIDER_HISTORICAL_PATHS = ['claude', 'gemini', 'openrouter', 'spark'];
const STATE_DIR = process.env.RUNNING_PI_STATE_DIR || path.join(ROOT, 'state');
const METRICS_DIR = path.join(STATE_DIR, 'metrics');
const PIPELINE_EVENTS_DIR = path.join(STATE_DIR, 'pipeline-events');

const SCHEMA = `
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  plan_key TEXT NOT NULL,
  timestamp TEXT,
  agent TEXT,
  provider TEXT,
  model TEXT,
  project_mode TEXT,
  verdict TEXT,
  route_to TEXT,
  gate TEXT,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  cost_usd REAL,
  context_file TEXT,
  exit_code INTEGER,
  fallback_from TEXT,
  tool_count INTEGER,
  routing_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project_plan ON agent_runs(project_id, plan_key);
CREATE INDEX IF NOT EXISTS idx_agent_runs_model ON agent_runs(model);
CREATE INDEX IF NOT EXISTS idx_agent_runs_timestamp ON agent_runs(timestamp);

CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  plan_key TEXT,
  role TEXT,
  model_label TEXT,
  is_secondary INTEGER NOT NULL DEFAULT 0,
  has_routing INTEGER NOT NULL DEFAULT 0,
  verdict TEXT,
  route_to TEXT,
  gate TEXT,
  title TEXT,
  mtime TEXT,
  bytes INTEGER,
  content_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_artifacts_project_plan ON artifacts(project_id, plan_key);
CREATE INDEX IF NOT EXISTS idx_artifacts_secondary ON artifacts(is_secondary, model_label);

CREATE TABLE IF NOT EXISTS merge_findings (
  id INTEGER PRIMARY KEY,
  artifact_path TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  plan_key TEXT,
  source TEXT,
  severity TEXT,
  classification TEXT,
  disposition TEXT,
  summary TEXT,
  UNIQUE(artifact_path, row_index)
);
CREATE INDEX IF NOT EXISTS idx_merge_findings_class ON merge_findings(classification, disposition);

CREATE TABLE IF NOT EXISTS pipeline_events (
  id INTEGER PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  timestamp TEXT NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  project_path TEXT NOT NULL,
  project_slug TEXT,
  pipeline_id TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  project_mode TEXT,
  status TEXT,
  actor TEXT,
  message TEXT,
  metadata_json TEXT,
  source TEXT
);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_project_plan ON pipeline_events(project_id, plan_key);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_pipeline ON pipeline_events(pipeline_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_status ON pipeline_events(status);
`;

function parseArgs(argv) {
  const args = { db: DEFAULT_DB, project: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--db') args.db = argv[++i];
    else if (arg === '--project') args.project.push(argv[++i]);
    else if (arg === '-h' || arg === '--help') {
      console.log('usage: ingest.mjs [--db PATH] [--project ROOT ...]');
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function utcFromTsMs(ms) { return new Date(ms).toISOString(); }
function safeHash(value) { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }
function canonicalPath(value) { return path.resolve(String(value).replace(/^~(?=$|[\\/])/, os.homedir())); }
function pathExists(p) { try { return existsSync(p); } catch { return false; } }
function readText(p) { return readFileSync(p, 'utf8'); }
function parseBool(value, defaultValue = false) { return value == null ? defaultValue : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()); }
function includeHistoricalProviderRecords() { return parseBool(process.env.PIDEX_INCLUDE_HISTORICAL_PROVIDERS, false); }

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}
function ensureColumn(db, table, column, definition) {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
function dbConnect(dbPath) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  ensureColumn(db, 'agent_runs', 'project_mode', 'TEXT');
  ensureColumn(db, 'pipeline_events', 'project_mode', 'TEXT');
  return db;
}

function projectId(db, projectPath) {
  const p = canonicalPath(projectPath);
  const name = path.basename(p) || p.replaceAll('/', '-').replaceAll('\\', '-');
  db.prepare('INSERT OR IGNORE INTO projects(path, name) VALUES (?, ?)').run(p, name);
  const row = db.prepare('SELECT id FROM projects WHERE path = ?').get(p);
  return Number(row.id);
}
function registerProject(db, projectPath, name) {
  const p = canonicalPath(projectPath);
  const n = String(name || path.basename(p) || p).trim() || p;
  db.prepare('INSERT OR IGNORE INTO projects(path, name) VALUES (?, ?)').run(p, n);
  db.prepare('UPDATE projects SET name = ? WHERE path = ? AND (name IS NULL OR name = ? OR name = ?)').run(n, p, path.basename(p), p);
  const row = db.prepare('SELECT id FROM projects WHERE path = ?').get(p);
  return Number(row.id);
}

function metricProjectFromSlug(slug) {
  if (slug.startsWith('home-')) {
    const parts = slug.split('-');
    if (parts.length >= 3) return `/${parts[0]}/${parts[1]}/${parts.slice(2).join('-').replaceAll('-', '/')}`;
  }
  return slug.replaceAll('-', '/');
}

function normalizePlanNumber(value) { return value.length < 3 && /^\d+$/.test(value) ? value.padStart(3, '0') : value; }
function normalizePlanKey(rec, fallback) {
  const explicitPlan = rec.plan;
  const plan = explicitPlan || fallback;
  const context = rec.context_file || '';
  let m = context.match(/(?:^|\/)(\d{1,3})[-_]/);
  if (m && (!explicitPlan || plan === 'plan-1' || plan === 'unknown-plan' || plan === fallback)) return `plan-${normalizePlanNumber(m[1])}`;
  m = String(plan).match(/^(?:plan-)?(\d{1,3})$/i);
  if (m) return `plan-${normalizePlanNumber(m[1])}`;
  return plan;
}
function normalizePipelinePlanKey(value) {
  const plan = String(value || 'unknown-plan').trim() || 'unknown-plan';
  let m = plan.match(/^(?:plan-)?(\d{1,3})$/i);
  if (m) return `plan-${normalizePlanNumber(m[1])}`;
  m = plan.match(/^(?:plan-)?(\d{1,3})[-_]/i);
  if (m) return `plan-${normalizePlanNumber(m[1])}`;
  if (plan.toLowerCase().startsWith('plan-')) return `plan-${plan.slice(5)}`;
  return plan;
}
function isHistoricalProvider(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v || v.includes('codex')) return false;
  return PROVIDER_HISTORICAL_PATHS.some((marker) => v.includes(marker));
}

function listFilesRecursive(root, predicate) {
  const out = [];
  if (!pathExists(root)) return out;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const p = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (!predicate || predicate(p)) out.push(p);
    }
  }
  return out.sort();
}
function globJsonlTwoLevels(root) {
  if (!pathExists(root)) return [];
  const out = [];
  for (const dir of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dirPath = path.join(root, dir.name);
    for (const file of readdirSync(dirPath, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.jsonl'))) out.push(path.join(dirPath, file.name));
  }
  return out.sort();
}

function ingestMetrics(db) {
  let count = 0;
  const stmt = db.prepare(`INSERT OR REPLACE INTO agent_runs(
    source_path, source_line, source_hash, project_id, plan_key, timestamp,
    agent, provider, model, project_mode, verdict, route_to, gate, duration_ms,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    cost_usd, context_file, exit_code, fallback_from, tool_count, routing_reason
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const file of globJsonlTwoLevels(METRICS_DIR)) {
    const fallbackProject = metricProjectFromSlug(path.basename(path.dirname(file)));
    const planKey = path.basename(file, '.jsonl');
    const lines = readText(file).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (!includeHistoricalProviderRecords() && isHistoricalProvider(rec.provider || '')) continue;
      const pid = projectId(db, rec.project || fallbackProject);
      stmt.run(String(file), i + 1, safeHash(`${file}:${i + 1}:${line}`), pid, normalizePlanKey(rec, planKey), rec.timestamp ?? null,
        rec.agent ?? null, rec.provider ?? null, rec.model ?? null, rec.project_mode ?? null, rec.agent_verdict ?? null, rec.route_to ?? null, rec.gate ?? null, rec.duration_ms ?? null,
        rec.input_tokens_estimate ?? null, rec.output_tokens_estimate ?? null, rec.cache_read_tokens ?? null, rec.cache_write_tokens ?? null, rec.cost_usd_estimate ?? null,
        rec.context_file ?? null, rec.exit_code ?? null, rec.fallback_from ?? null, rec.tool_count ?? null, rec.routing_reason ?? null);
      count++;
    }
  }
  return count;
}

function ingestPipelineEvents(db) {
  let count = 0;
  const stmt = db.prepare(`INSERT OR REPLACE INTO pipeline_events(
    source_path, source_line, source_hash, timestamp, project_id, project_path,
    project_slug, pipeline_id, plan_key, event_type, project_mode, status, actor, message,
    metadata_json, source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const file of globJsonlTwoLevels(PIPELINE_EVENTS_DIR)) {
    const lines = readText(file).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const projectPath = rec.project_path || rec.project;
      if (!projectPath) continue;
      const timestamp = rec.timestamp || utcFromTsMs(statSync(file).mtimeMs);
      const pipelineId = rec.pipeline_id || path.basename(file, '.jsonl');
      const eventType = rec.event_type || rec.event;
      if (!pipelineId || !eventType) continue;
      const metadataJson = rec.metadata == null ? (rec.metadata_json ?? null) : JSON.stringify(rec.metadata);
      const pid = projectId(db, projectPath);
      stmt.run(String(file), i + 1, safeHash(`${file}:${i + 1}:${line}`), timestamp, pid, String(projectPath), rec.project_slug ?? null,
        pipelineId, normalizePipelinePlanKey(rec.plan_key || rec.plan), eventType, rec.project_mode ?? null, rec.status ?? null, rec.actor ?? null, rec.message ?? null, metadataJson, rec.source ?? null);
      count++;
    }
  }
  return count;
}

function parseRouting(text) {
  const m = text.match(/<!--\s*ROUTING(?<body>.*?)-->/is);
  if (!m) return {};
  const out = {};
  for (const line of m.groups.body.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    out[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return out;
}
function extractPlanKey(filePath, text) {
  let m = text.match(/\b(?:plan|id|origin)\s*[:=]\s*([0-9][A-Za-z0-9._-]*)/i);
  if (m) return `plan-${m[1].toLowerCase().replace(/^plan-/, '')}`;
  m = path.basename(filePath).match(/^([0-9][A-Za-z0-9._-]*)[-_]/);
  if (m) return `plan-${m[1].toLowerCase().replace(/^plan-/, '')}`;
  return null;
}
function artifactRole(filePath) {
  const parts = filePath.split(/[\\/]/);
  const idx = parts.indexOf('agents.output');
  return idx !== -1 && idx + 1 < parts.length ? parts[idx + 1] : null;
}
function modelLabel(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name.includes('.deepseek.md')) return 'deepseek';
  if (name.includes('.minimax.md')) return 'minimax';
  return null;
}
function isMergeArtifact(filePath, text) {
  const name = path.basename(filePath).toLowerCase();
  return (name.includes('merge') && (name.includes('summary') || name.endsWith('-merge.md'))) || text.toLowerCase().includes('parallel secondary');
}
function markdownTableRows(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('|') && line.endsWith('|') && !/^\|[\s:\-|]+\|$/.test(line)).map((line) => line.slice(1, -1).split('|').map((c) => c.trim())).filter((cells) => cells.length >= 3);
}
function ingestMergeRows(db, filePath, pid, planKey, text) {
  const artifactPath = canonicalPath(filePath);
  db.prepare('DELETE FROM merge_findings WHERE artifact_path = ?').run(artifactPath);
  const stmt = db.prepare('INSERT OR REPLACE INTO merge_findings(artifact_path, row_index, project_id, plan_key, source, severity, classification, disposition, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  let count = 0;
  markdownTableRows(text).forEach((cells, idx0) => {
    const idx = idx0 + 1;
    const joined = cells.join(' | ');
    const low = joined.toLowerCase();
    if (idx === 1 && (low.includes('source') || low.includes('finding'))) return;
    if (!['secondary', 'confirmed', 'malformed', 'contradicted', 'accepted', 'deferred', 'critical', 'high', 'medium', 'low', 'minor'].some((t) => low.includes(t))) return;
    const severity = cells.find((c) => /\b(critical|high|medium|low|minor|info)\b/i.test(c)) || '';
    const classification = cells.find((c) => /secondary-only|confirmed-by|primary-only|duplicate|contradicted|malformed|no-evidence/i.test(c)) || '';
    const disposition = cells.find((c) => /accepted|deferred|duplicate|rejected|needs-primary|no-evidence/i.test(c)) || '';
    stmt.run(artifactPath, idx, pid, planKey, cells[0] || '', severity, classification, disposition, joined.slice(0, 1000));
    count++;
  });
  return count;
}

function projectPipelineRegistryRoot() {
  return path.join(STATE_DIR, 'sandbox-projects');
}
function projectPipelineArchiveRoot(projectId) {
  return path.join(STATE_DIR, 'project-archives', String(projectId || ''));
}
function registryProjectPath(record) {
  const sourceRef = String(record?.source?.ref || '').trim();
  if (sourceRef) return sourceRef;
  const archivePath = String(record?.archive?.path || '').trim();
  if (archivePath) return archivePath;
  if (record?.project_id) return projectPipelineArchiveRoot(record.project_id);
  return '';
}
function ingestProjectPipelineRegistry(db) {
  let count = 0;
  const root = projectPipelineRegistryRoot();
  if (!pathExists(root)) return count;
  for (const entry of readdirSync(root, { withFileTypes: true }).filter((item) => item.isFile() && item.name.endsWith('.json'))) {
    const file = path.join(root, entry.name);
    let record;
    try { record = JSON.parse(readText(file)); } catch { continue; }
    if (record?.mode !== 'project-pipeline') continue;
    const projectPath = registryProjectPath(record);
    if (!projectPath) continue;
    registerProject(db, projectPath, record.name || record.project_id || path.basename(projectPath));
    const archive = record.archive?.path || (record.project_id ? projectPipelineArchiveRoot(record.project_id) : '');
    if (archive && pathExists(archive)) registerProject(db, archive, `${record.name || record.project_id} archive`);
    count++;
  }
  return count;
}

function discoverProjects(rawProjects) {
  const projects = [];
  for (const raw of rawProjects) {
    const p = canonicalPath(raw);
    if (pathExists(p) && !projects.includes(p)) projects.push(p);
  }
  if (!parseBool(process.env.PIDEX_DASHBOARD_INCLUDE_EXTERNAL_PROJECTS, false)) {
    if (!projects.length) for (const p of [ROOT, ANALYTICS]) if (pathExists(p) && !projects.includes(p)) projects.push(p);
    return projects;
  }
  for (const raw of (process.env.PIDEX_DASHBOARD_EXTERNAL_PROJECTS || '').split(path.delimiter)) {
    if (!raw.trim()) continue;
    const p = canonicalPath(raw);
    if (pathExists(p) && !projects.includes(p)) projects.push(p);
  }
  return projects;
}

function ingestArtifacts(db, projects) {
  let artifactCount = 0;
  let mergeCount = 0;
  const artifactStmt = db.prepare(`INSERT OR REPLACE INTO artifacts(path, project_id, plan_key, role, model_label, is_secondary, has_routing, verdict, route_to, gate, title, mtime, bytes, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let project of projects) {
    project = canonicalPath(project);
    const out = path.join(project, 'agents.output');
    if (!pathExists(out)) continue;
    const pid = projectId(db, project);
    for (const filePath of listFilesRecursive(out, (p) => p.endsWith('.md'))) {
      let stat, text;
      try { stat = statSync(filePath); text = readText(filePath); } catch { continue; }
      const routing = parseRouting(text);
      const title = (text.split(/\r?\n/).find((line) => line.startsWith('#')) || path.basename(filePath, '.md')).replace(/^#+\s*/, '').trim();
      const role = artifactRole(filePath);
      const label = modelLabel(filePath);
      const secondary = label ? 1 : 0;
      const merge = isMergeArtifact(filePath, text);
      if (!secondary && !merge) continue;
      const planKey = extractPlanKey(filePath, text);
      artifactStmt.run(canonicalPath(filePath), pid, planKey, role, label, secondary, Object.keys(routing).length ? 1 : 0,
        routing.verdict ?? null, routing.route_to ?? null, routing.gate ?? null, title.slice(0, 300), utcFromTsMs(stat.mtimeMs), stat.size, safeHash(text));
      artifactCount++;
      if (merge) mergeCount += ingestMergeRows(db, filePath, pid, planKey, text);
    }
  }
  return [artifactCount, mergeCount];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = dbConnect(path.resolve(args.db));
  const projects = discoverProjects(args.project);
  let metricCount = 0, pipelineEventCount = 0, artifactCount = 0, mergeCount = 0, projectPipelineRegistryCount = 0;
  try {
    db.exec('BEGIN');
    projectPipelineRegistryCount = ingestProjectPipelineRegistry(db);
    metricCount = ingestMetrics(db);
    pipelineEventCount = ingestPipelineEvents(db);
    [artifactCount, mergeCount] = ingestArtifacts(db, projects);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    db.close();
  }
  console.log(JSON.stringify({ db: path.resolve(args.db), projects, project_pipeline_registry: projectPipelineRegistryCount, agent_runs: metricCount, pipeline_events: pipelineEventCount, artifacts: artifactCount, merge_findings: mergeCount }, null, 2));
}

main();
