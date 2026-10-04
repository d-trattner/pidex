import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStateRoot } from '../../lib/state-root.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
function fail(message, status = 2) { throw Object.assign(new Error(message), { status }); }
function valueAt(args, index) {
  if (index + 1 >= args.length) fail(`missing value for ${args[index]}`, 1);
  return args[index + 1];
}

function append(args, file) {
  let event = '';
  const fields = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!flag.startsWith('--')) fail(`unknown arg: ${flag}`);
    const value = valueAt(args, i);
    if (flag === '--event') event = value;
    else {
      const key = flag.slice(2).replaceAll('-', '_');
      // Legacy jq named variables admit identifiers, not arbitrary filter syntax.
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) fail(`invalid field: ${flag}`, 3);
      // jq's initial --arg ts wins over later duplicate named arguments.
      if (key !== 'ts') fields[key] = value;
    }
  }
  if (!event) fail('missing --event');
  const row = { ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), event, ...fields };
  const bytes = JSON.stringify(row) + '\n';
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, bytes, 'utf8');
}

function compoundEnd(text, start) {
  // Quoted tokens consume escaped quotes/braces; JSON.parse validates the slice.
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[{}\[\]]/g;
  tokens.lastIndex = start;
  let depth = 0; let token;
  while ((token = tokens.exec(text))) {
    const ch = token[0][0];
    if (ch === '"') continue;
    depth += ch === '{' || ch === '[' ? 1 : -1;
    if (depth === 0) return tokens.lastIndex;
  }
  return text.length;
}
function scalarEnd(text, start) {
  const token = /^(?:"(?:[^"\\]|\\[\s\S])*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(start));
  if (!token) fail('invalid history JSON stream', 5);
  const end = start + token[0].length;
  if (end < text.length && !/[ \t\r\n{}\[\]"]/.test(text[end])) fail('invalid history JSON stream boundary', 5);
  return end;
}
// jq -s accepts a stream of JSON values, not merely one object per physical line.
function jsonStream(text) {
  const values = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    if (/[ \t\r\n]/.test(text[i])) { i += 1; continue; }
    const start = i;
    i = text[i] === '{' || text[i] === '[' ? compoundEnd(text, i) : scalarEnd(text, i);
    try { values.push(JSON.parse(text.slice(start, i))); }
    catch { fail('invalid history JSON stream', 5); }
  }
  return values;
}

function textOrder(a, b) { return Buffer.compare(Buffer.from(a), Buffer.from(b)); }
function typeRank(value) {
  if (value === null) return 0;
  if (value === false) return 1;
  if (value === true) return 2;
  if (typeof value === 'number') return 3;
  if (typeof value === 'string') return 4;
  return Array.isArray(value) ? 5 : 6;
}
// jq value ordering: null, false, true, number, string, array, object.
function compare(a, b) {
  const rank = typeRank(a) - typeRank(b);
  if (rank) return rank;
  if (a === b) return 0;
  if (typeof a === 'number') return a < b ? -1 : 1;
  if (typeof a === 'string') return textOrder(a, b);
  if (Array.isArray(a)) return compareArrays(a, b);
  const keysA = Object.keys(a).sort(textOrder); const keysB = Object.keys(b).sort(textOrder);
  return compareArrays(keysA, keysB) || compareArrays(keysA.map((key) => a[key]), keysB.map((key) => b[key]));
}
function compareArrays(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const result = compare(a[i], b[i]); if (result) return result;
  }
  return a.length - b.length;
}
function stringify(value) { return typeof value === 'string' ? value : JSON.stringify(value); }
function fallback(value, alternative) { return value === null || value === false ? alternative : value; }

function eligibleCwd(row, tempRoot) {
  if (row === null) return null;
  if (typeof row !== 'object' || Array.isArray(row)) fail('history entry must be an object', 5);
  const cwd = row.cwd ?? null;
  if (cwd === null || cwd === '') return null;
  if (typeof cwd !== 'string') fail('history cwd must be a string', 5);
  return cwd === tempRoot || cwd.startsWith(tempRoot + '/') ? null : cwd;
}
function selectProjects(rows, tempRoot) {
  const groups = new Map();
  for (const row of rows) {
    const cwd = eligibleCwd(row, tempRoot); if (cwd === null) continue;
    const previous = groups.get(cwd);
    if (!previous || compare(row.ts ?? null, previous.ts ?? null) >= 0) groups.set(cwd, row);
  }
  // Stable timestamp sort followed by reverse preserves jq's descending cwd ties.
  return [...groups.values()].sort((a, b) => textOrder(a.cwd, b.cwd)).map((row) => ({
    cwd: row.cwd, last_event: row.event ?? null, last_ts: row.ts ?? null,
    last_epic: stringify(fallback(row.epic ?? null, '')), last_mode: row.mode ?? null,
  })).sort((a, b) => compare(a.last_ts, b.last_ts)).reverse();
}
function printProjects(projects, asJson) {
  if (asJson) { process.stdout.write(JSON.stringify(projects, null, 2) + '\n'); return; }
  const raw = (value) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2)).replace(/\n+$/, ''); // Bash command substitution removed trailing LF.
  for (let i = 0; i < projects.length; i += 1) {
    if (i >= 10) fail('text labels exhausted; use --json for more than ten projects', 1);
    const row = projects[i]; const epic = raw(row.last_epic);
    process.stdout.write(`${'ABCDEFGHIJ'[i]}) ${raw(row.cwd)}\n   last touched: ${raw(row.last_ts)} (${raw(fallback(row.last_mode, '—'))}, ${raw(row.last_event)})\n`);
    if (epic) process.stdout.write(`   epic: ${epic}\n`);
  }
}
function list(args, file, env) {
  let limitText = '5'; let asJson = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--json') asJson = true;
    else if (args[i] === '--limit') { limitText = valueAt(args, i); i += 1; }
    else fail(`unknown arg: ${args[i]}`);
  }
  let text;
  try { text = readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (text === '') return;
  let limit;
  try { limit = JSON.parse(limitText); } catch { fail('invalid JSON --limit'); }
  if (limit !== null && typeof limit !== 'number') fail('limit must be numeric or null', 5);
  const projects = selectProjects(jsonStream(text), (env.TMPDIR || '/tmp').replace(/\/$/, ''));
  printProjects(limit === null ? projects : projects.slice(0, Math.ceil(limit)), asJson);
}

export function historyMain(kind, args = process.argv.slice(2), env = process.env) {
  try {
    const file = path.join(resolveStateRoot({ root: ROOT, env }), 'history.jsonl');
    if (kind === 'append') append(args, file);
    else if (kind === 'list') list(args, file, env);
    else fail('unknown history operation');
  } catch (error) {
    process.stderr.write(`pidex history ${kind}: ${error.message}\n`);
    process.exitCode = error.status || 1;
  }
}
