import { createHash } from 'node:crypto';
import { RECOVERY_SCHEMA, RECOVERY_EVENTS, artifactPathValid, digestValid, foldRecoveryEvent, assertRecoverableEnd } from './closeout-receipt.mjs';

export const CLOSEOUT_SCHEMA = 'pidex-closeout-v2';
export const CLOSEOUT_START = 'pipeline_closeout_dispatch_started';
export const CLOSEOUT_END = 'pipeline_closeout_dispatch_finished';
export const CLOSEOUT_PUBLISHERS = new Set(['pidex-retrospective', 'pidex-pi']);
export const POST_RETRO_AGENTS = new Set(['pidex-planner', 'pidex-roadmap', 'pidex-architect']);
const actors = new Set([...CLOSEOUT_PUBLISHERS, ...POST_RETRO_AGENTS]);
const uuid = /^[a-f0-9-]{36}$/;
const hex = /^[a-f0-9]{64}$/;
const fail = code => { throw new Error(code); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort();
export const closeoutHash = bytes => createHash('sha256').update(bytes).digest('hex');

function exact(value, names) {
  return value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(), sorted(names));
}
function contextValid(row, context) {
  return ['pidex-closeout-v1', CLOSEOUT_SCHEMA, RECOVERY_SCHEMA].includes(row?.metadata?.schema) && row.metadata.pipelineId === context.pipelineId && row.metadata.planId === context.planId && row.metadata.project === context.project;
}
function artifactValid(artifact) {
  return exact(artifact, ['path', 'digest', 'content']) && typeof artifact.content === 'string' && Buffer.byteLength(artifact.content) <= 128 * 1024 && closeoutHash(artifact.content) === artifact.digest && typeof artifact.path === 'string' && /^agents\.output\/[A-Za-z0-9._/-]+\.md$/.test(artifact.path) && !artifact.path.split('/').some(p => p === '..' || p === '.' || p === '') && hex.test(artifact.digest);
}
function startFold(m, state) {
  if (!exact(m, ['schema', 'pipelineId', 'planId', 'project', 'id', 'actor', 'roundId', 'consumes', ...(m.schema === RECOVERY_SCHEMA ? ['scope', 'artifactPath', 'hookRequired'] : [])]) || !uuid.test(m.id) || !uuid.test(m.roundId) || !actors.has(m.actor) || !Array.isArray(m.consumes) || new Set(m.consumes).size !== m.consumes.length || state.dispatches.has(m.id)) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  if ([...state.dispatches.values()].some(d => d.status === 'running' && (d.actor === m.actor || (CLOSEOUT_PUBLISHERS.has(d.actor) && CLOSEOUT_PUBLISHERS.has(m.actor))))) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  if (m.schema === RECOVERY_SCHEMA && (!digestValid(m.scope) || !artifactPathValid(m.artifactPath) || m.hookRequired !== (m.actor === 'pidex-retrospective'))) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  // This first recovery increment permits one physical call per actor/pipeline.
  // Even a completed return must be replayed, not respawned under a new nonce.
  if ([...state.dispatches.values()].some(d => d.actor === m.actor && d.schema === RECOVERY_SCHEMA)) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  const expected = [...state.obligations.values()].filter(o => o.status === 'pending' && o.actor === m.actor).map(o => o.id);
  if (!same(sorted(expected), sorted(m.consumes))) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  if (!CLOSEOUT_PUBLISHERS.has(m.actor) && !expected.length) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  if (m.actor === 'pidex-pi' && !expected.length && [...state.obligations.values()].some(o => o.status === 'pending')) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  if (m.actor === 'pidex-retrospective' && [...state.obligations.values()].some(o => o.status === 'pending')) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  const rounds = new Set(m.consumes.map(id => state.obligations.get(id).roundId));
  const expectedRound = rounds.size ? [...rounds][0] : m.id;
  if (rounds.size > 1 || m.roundId !== expectedRound) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  state.dispatches.set(m.id, { ...m, status: 'running' });
}
function endFold(m, state) {
  if (!exact(m, ['schema', 'pipelineId', 'planId', 'project', 'id', 'outcome', 'artifact', 'verdict', 'requests']) || !['completed', 'failed'].includes(m.outcome)) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  const dispatch = state.dispatches.get(m.id);
  if (!dispatch || dispatch.schema !== m.schema || dispatch.status !== 'running' || !Array.isArray(m.requests) || new Set(m.requests).size !== m.requests.length) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  assertRecoverableEnd(dispatch, m);
  if (m.outcome === 'failed') {
    if (m.artifact !== null || m.verdict !== null || m.requests.length) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
    dispatch.status = 'failed'; return;
  }
  if (!artifactValid(m.artifact) || !['COMPLETE', 'APPROVED', ...(dispatch.actor === 'pidex-pi' ? ['DEFERRED'] : [])].includes(m.verdict)) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  if (dispatch.actor === 'pidex-retrospective' && (m.verdict !== 'COMPLETE' || !m.requests.includes('pidex-pi'))) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  const declared = closeoutResultRouting(dispatch.actor, dispatch.schema === RECOVERY_SCHEMA ? dispatch.receipt.result.finalText : m.artifact.content, m.artifact.content, dispatch.schema !== 'pidex-closeout-v1');
  if (declared.dispatchId !== m.id || !same(sorted(declared.consumes), sorted(dispatch.consumes)) || declared.verdict !== m.verdict || declared.path !== m.artifact.path || !same(sorted(declared.requests), sorted(m.requests))) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  if (m.requests.some(a => !POST_RETRO_AGENTS.has(a) && !(dispatch.actor === 'pidex-retrospective' && a === 'pidex-pi')) || (!CLOSEOUT_PUBLISHERS.has(dispatch.actor) && m.requests.length)) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  for (const id of dispatch.consumes) {
    const obligation = state.obligations.get(id);
    if (!obligation || obligation.status !== 'pending') fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
    obligation.status = 'completed'; obligation.completedBy = m.id;
  }
  for (const actor of m.requests) {
    const id = `${dispatch.roundId}/${actor}`;
    // PI echoes declarations from the same round; never erase/reopen an already
    // completed obligation or duplicate a pending one.
    if (!state.obligations.has(id)) state.obligations.set(id, { id, actor, roundId: dispatch.roundId, status: 'pending', source: m.artifact, declaredBy: m.id });
  }
  dispatch.status = 'completed'; dispatch.artifact = m.artifact;
}
export function foldCloseoutObligations(rows, context) {
  const state = { dispatches: new Map(), obligations: new Map() };
  for (const row of rows) {
    if (!String(row?.event_type).startsWith('pipeline_closeout_')) continue;
    if (!contextValid(row, context)) fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
    if (row.event_type === CLOSEOUT_START) startFold(row.metadata, state);
    else if (row.event_type === CLOSEOUT_END) endFold(row.metadata, state);
    else if (RECOVERY_EVENTS.has(row.event_type)) foldRecoveryEvent(row, state);
    else fail('PIPELINE_CLOSEOUT_HISTORY_INVALID');
  }
  return state;
}
export function assertCloseoutObligationsComplete(rows, context) {
  const state = foldCloseoutObligations(rows, context);
  if ([...state.dispatches.values()].some(d => d.status === 'running') || [...state.obligations.values()].some(o => o.status === 'pending')) fail('PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING');
  // A failed publisher has not supplied a complete declaration. A successful
  // subsequent publisher of the same actor is required; failure is not waiver.
  const latest = new Map(); for (const d of state.dispatches.values()) latest.set(d.actor, d);
  if ([...latest.values()].some(d => CLOSEOUT_PUBLISHERS.has(d.actor) && d.status !== 'completed')) fail('PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING');
}
function routing(text, compact = true) {
  if (typeof text !== 'string') fail('PIPELINE_CLOSEOUT_ROUTING_INVALID');
  const matches = [...text.matchAll(/<!--\s*ROUTING\b([\s\S]*?)-->/g)]; const last = matches.at(-1);
  if (!last || [...text.matchAll(/<!--\s*ROUTING\b/g)].at(-1).index !== last.index) fail('PIPELINE_CLOSEOUT_ROUTING_INVALID');
  const values = {};
  // Semicolons delimit fields only before an explicit key. Other semicolons
  // remain value text; duplicate authority fields still fail closed.
  for (const line of last[1].split(compact ? /\r?\n|;\s*(?=[a-z_]+:)/ : '\n')) {
    const match = line.match(/^\s*([a-z_]+):\s*(.*?)\s*$/); if (!match) continue;
    if (Object.hasOwn(values, match[1])) fail('PIPELINE_CLOSEOUT_ROUTING_INVALID');
    values[match[1]] = match[2];
  }
  return values;
}
function requests(value) {
  if (value === 'none') return [];
  if (typeof value !== 'string' || !value) fail('PIPELINE_CLOSEOUT_DECLARATION_REQUIRED');
  const result = value.split(',').map(a => a.trim());
  if (new Set(result).size !== result.length || result.some(a => !POST_RETRO_AGENTS.has(a))) fail('PIPELINE_CLOSEOUT_DECLARATION_INVALID');
  return result.sort();
}
// These are the existing workflow's structural handoff sections, not arbitrary
// prose classification. Positive section content is additive; `none` cannot
// waive it. Keep v1 replay declared-only rather than rewriting old authority.
function sectionHandoffs(text) {
  const targets = new Map([['planning insights', 'pidex-planner'], ['roadmap updates', 'pidex-roadmap'], ['architecture patterns', 'pidex-architect']]);
  const found = new Set(); let active = null; let fence = null;
  const finish = () => {
    if (!active) return;
    const body = active.lines.join('\n').trim();
    if (body && !/^(?:[-*]\s+)?(?:none|n\/a|not applicable)\.?$/i.test(body)) found.add(active.actor);
    active = null;
  };
  for (const line of text.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (active) active.lines.push(line);
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; if (active) active.lines.push(line); continue; }
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const title = heading[2].replace(/^\d+[.)]\s*/, '').replace(/:\s*$/, '').trim().toLowerCase();
      const actor = targets.get(title);
      if (actor || (active && heading[1].length <= active.level)) finish();
      if (actor) { active = { actor, level: heading[1].length, lines: [] }; continue; }
    }
    if (active) active.lines.push(line);
  }
  finish(); return [...found].sort();
}
export function closeoutResultRouting(actor, finalText, artifactText, currentProtocol = true) {
  const final = routing(finalText, currentProtocol); const artifact = routing(artifactText, currentProtocol);
  for (const key of ['verdict', 'route_to', 'context_file', 'closeout_dispatch', 'closeout_obligations']) if (!final[key] || final[key] !== artifact[key]) fail('PIPELINE_CLOSEOUT_ROUTING_MISMATCH');
  const publisher = CLOSEOUT_PUBLISHERS.has(actor);
  const declared = publisher ? requests(final.post_retro_handoffs) : [];
  if (publisher && !same(declared, requests(artifact.post_retro_handoffs))) fail('PIPELINE_CLOSEOUT_ROUTING_MISMATCH');
  if (publisher && currentProtocol) for (const target of sectionHandoffs(artifactText)) if (!declared.includes(target)) declared.push(target);
  if (actor === 'pidex-retrospective' && final.verdict === 'COMPLETE') {
    if (final.route_to !== 'pidex-pi') fail('PIPELINE_CLOSEOUT_ROUTING_INVALID');
    declared.push('pidex-pi');
  }
  const positive = ['COMPLETE', 'APPROVED', ...(actor === 'pidex-pi' ? ['DEFERRED'] : [])].includes(final.verdict);
  if (actor !== 'pidex-retrospective' && positive && final.route_to !== 'orchestrator') fail('PIPELINE_CLOSEOUT_ROUTING_INVALID');
  if (!uuid.test(final.closeout_dispatch)) fail('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
  const consumes = final.closeout_obligations === 'none' ? [] : final.closeout_obligations.split(',').map(s => s.trim());
  if (new Set(consumes).size !== consumes.length || consumes.some(id => !/^[a-f0-9-]{36}\/pidex-(pi|planner|roadmap|architect)$/.test(id))) fail('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
  return { verdict: final.verdict, requests: declared.sort(), path: final.context_file, dispatchId: final.closeout_dispatch, consumes };
}
export function closeoutArtifactPath(finalText) { return routing(finalText).context_file; }
