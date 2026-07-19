#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeReviewVerdict } from '../../extensions/pidex/review-budget.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const CLASSES = new Set(['Product', 'SharedContract', 'Evidence', 'Process', 'SideEffect']);
const SEVERITIES = new Set(['Critical', 'Security', 'High', 'Medium', 'Low', 'Info']);
const RELATIONS = new Set(['assigned', 'new', 'fix_induced']);
const REPRODUCTION = new Set(['reproduced', 'causal', 'not_reproduced', 'not_tested']);
const GATES = new Set(['critic', 'code-review', 'security', 'qa']);
const FINDING_KEYS = new Set(['findingId', 'relation', 'class', 'reproductionState', 'causedByCorrection', 'severity', 'disposition']);
const ARCHIVE_KEYS = new Set([...FINDING_KEYS, 'title', 'shortDescription', 'originEpic', 'reviewArtifact', 'affectedIdentifiers', 'deferredReason', 'nextAnalysisOrDisconfirmingTest']);
const ITEM_FIELDS = ['stableTbrId', 'status', 'title', 'findingClass', 'proposedSeverity', 'reproductionState', 'blockingScope', 'releaseRecommendation', 'originEpic', 'originPlan', 'originRun', 'originGate', 'sourceFindingId', 'reviewArtifact', 'createdAt'];
const UNSAFE_CONTENT = /(?:api[_-]?key\s*[=:]|authorization\s*:|bearer\s+[A-Za-z0-9._-]{16,}|password\s*[=:]|secret\s*[=:]|gh[pousr]_[A-Za-z0-9]{16,}|ignore (?:all |previous )?instructions|<\/?(?:system|assistant)>|^\d{4}-\d\d-\d\d[ T].*\b(?:DEBUG|INFO|WARN|ERROR)\b)/im;
const CONTROL = /[\u0000-\u001f\u007f]/;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function text(value, limit) { return typeof value === 'string' && value.length > 0 && value.length <= limit && !CONTROL.test(value) && !UNSAFE_CONTENT.test(value); }
function pathText(value, limit) { return text(value, limit) && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..'); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'finding'; }
function exactKeys(value, allowed) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.has(key)) && [...allowed].every((key) => key in value); }
function archiveFields(finding) { return text(finding.title, 120) && text(finding.shortDescription, 500) && text(finding.originEpic, 80) && pathText(finding.reviewArtifact, 240) && Array.isArray(finding.affectedIdentifiers) && finding.affectedIdentifiers.length <= 20 && finding.affectedIdentifiers.every((item) => pathText(item, 160)) && text(finding.deferredReason, 500) && text(finding.nextAnalysisOrDisconfirmingTest, 500); }
function validFinding(finding) { return exactKeys(finding, ARCHIVE_KEYS) && ID.test(finding.findingId) && RELATIONS.has(finding.relation) && CLASSES.has(finding.class) && REPRODUCTION.has(finding.reproductionState) && typeof finding.causedByCorrection === 'boolean' && SEVERITIES.has(finding.severity) && finding.disposition === 'tbr_immediate' && archiveFields(finding); }
function validIdentity(identity) { return identity && text(identity.planId, 80) && text(identity.runFamilyId, 80) && GATES.has(identity.reviewGate); }
export function validateReviewOutcome(outcome, reviewGate) {
  const verdict = normalizeReviewVerdict(reviewGate, outcome?.verdict);
  if (!outcome || typeof outcome !== 'object' || !verdict || !Array.isArray(outcome.findings) || outcome.findings.length > 20) return { ok: false, code: 'REVIEW_OUTCOME_INVALID' };
  const ids = new Set(), active = [], immediateTbr = [];
  for (const finding of outcome.findings) {
    const isActive = finding?.relation === 'assigned' || (finding?.relation === 'fix_induced' && ['Product', 'SharedContract'].includes(finding?.class) && finding?.reproductionState === 'reproduced' && finding?.causedByCorrection === true && ['Critical', 'Security'].includes(finding?.severity));
    const keys = isActive ? FINDING_KEYS : ARCHIVE_KEYS;
    if (!exactKeys(finding, keys) || !ID.test(finding.findingId || '') || ids.has(finding.findingId) || !RELATIONS.has(finding.relation) || !CLASSES.has(finding.class) || !REPRODUCTION.has(finding.reproductionState) || typeof finding.causedByCorrection !== 'boolean' || !SEVERITIES.has(finding.severity) || finding.disposition !== (isActive ? 'active' : 'tbr_immediate') || (!isActive && !archiveFields(finding))) return { ok: false, code: 'REVIEW_FINDING_INVALID' };
    ids.add(finding.findingId); (isActive ? active : immediateTbr).push(finding);
  }
  if (verdict === 'CHANGES_REQUESTED' && !active.length) return { ok: false, code: 'REVIEW_REJECTION_EMPTY' };
  return { ok: true, value: { verdict, active, immediateTbr } };
}
export function renderTbrItem(item) {
  const fields = ITEM_FIELDS.map((key) => `${key}: ${item[key]}`);
  const promotion = item.status === 'promoted' ? `\nroadmapCandidate: ${item.roadmapCandidate}\npromotedAt: ${item.promotedAt}` : '';
  return `---\n${fields.join('\n')}\naffectedIdentifiers:\n${item.affectedIdentifiers.map((value) => `  - ${value}`).join('\n')}${promotion}\n---\n\n## Short description\n\n${item.shortDescription}\n\n## Deferred reason\n\n${item.deferredReason}\n\n## Smallest future analysis or disconfirming test\n\n${item.nextAnalysisOrDisconfirmingTest}\n\n## Navigation\n\n- Archive: [[../index]]\n`;
}
function itemFor(identity, finding) {
  const stableTbrId = `TBR-${createHash('sha256').update([identity.planId, identity.runFamilyId, identity.reviewGate, finding.findingId].join('\0')).digest('hex').slice(0, 12)}`;
  return { stableTbrId, status: 'open', title: finding.title, findingClass: finding.class, proposedSeverity: finding.severity, reproductionState: finding.reproductionState, blockingScope: 'none', releaseRecommendation: ['Critical', 'Security'].includes(finding.severity) ? 'hold' : 'none', originEpic: finding.originEpic, originPlan: identity.planId, originRun: identity.runFamilyId, originGate: identity.reviewGate, sourceFindingId: finding.findingId, reviewArtifact: finding.reviewArtifact, createdAt: new Date().toISOString(), affectedIdentifiers: finding.affectedIdentifiers, shortDescription: finding.shortDescription, deferredReason: finding.deferredReason, nextAnalysisOrDisconfirmingTest: finding.nextAnalysisOrDisconfirmingTest };
}
function canonicalRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(path.resolve(root)) || !existsSync(root)) fail('TBR_PATH_INVALID');
  const stat = lstatSync(root); if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== path.resolve(root)) fail('TBR_PATH_INVALID');
  return root;
}
function secureDir(root, parts) {
  let current = root;
  for (const part of parts) { current = path.join(current, part); if (!existsSync(current)) mkdirSync(current, { mode: 0o700 }); const stat = lstatSync(current); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('TBR_PATH_INVALID'); }
  return current;
}
function parseItem(file, name) {
  const match = name.match(/^(TBR-[a-f0-9]{12})-([a-z0-9-]{1,60})\.md$/); if (!match) return null;
  const textBody = readFileSync(file, 'utf8'); const frontmatter = textBody.match(/^---\n([\s\S]*?)\n---\n/); if (!frontmatter) fail('TBR_ITEM_INVALID');
  const item = { affectedIdentifiers: [] }; let affected = false;
  for (const line of frontmatter[1].split('\n')) {
    if (line === 'affectedIdentifiers:') { affected = true; continue; }
    if (affected && line.startsWith('  - ')) { item.affectedIdentifiers.push(line.slice(4)); continue; }
    const separator = line.indexOf(': '); if (separator < 1) fail('TBR_ITEM_INVALID'); item[line.slice(0, separator)] = line.slice(separator + 2);
  }
  const sections = textBody.match(/\n\n## Short description\n\n([^\n]*)\n\n## Deferred reason\n\n([^\n]*)\n\n## Smallest future analysis or disconfirming test\n\n([^\n]*)\n\n## Navigation\n\n- Archive: \[\[\.\.\/index\]\]\n$/);
  if (!sections) fail('TBR_ITEM_INVALID'); Object.assign(item, { shortDescription: sections[1], deferredReason: sections[2], nextAnalysisOrDisconfirmingTest: sections[3] });
  if (item.stableTbrId !== match[1] || !ITEM_FIELDS.every((field) => typeof item[field] === 'string') || !['open', 'promoted'].includes(item.status) || (item.status === 'promoted' && (!text(item.roadmapCandidate, 240) || !text(item.promotedAt, 40))) || renderTbrItem(item) !== textBody) fail('TBR_ITEM_INVALID');
  return { ...item, file: name };
}
function readCanonicalItems(dir) {
  const found = new Map();
  for (const name of readdirSync(dir).sort()) { const item = parseItem(path.join(dir, name), name); if (!item) continue; if (found.has(item.stableTbrId)) fail('TBR_COLLISION'); found.set(item.stableTbrId, item); }
  return found;
}
function atomicWrite(file, textBody) { const temporary = `${file}.${process.pid}.tmp`; writeFileSync(temporary, textBody, { mode: 0o600, flag: 'wx' }); renameSync(temporary, file); }
function renderIndex(items) { const rows = [...items].sort((left, right) => left.stableTbrId.localeCompare(right.stableTbrId)).map((item) => `| ${item.stableTbrId} | ${item.status} | ${item.title} | ${item.findingClass} | ${item.proposedSeverity} | ${item.originPlan} | ${item.originGate} |`).join('\n'); return `# TBR Archive\n\n| ID | Status | Title | Class | Severity | Plan | Gate |\n|---|---|---|---|---|---|---|\n${rows}\n`; }
function writeIndex(root, items) { atomicWrite(path.join(secureDir(root, ['wiki', 'tbr']), 'index.md'), renderIndex(items)); }
function codeFor(error) { return ['TBR_INVALID', 'TBR_ITEM_INVALID', 'TBR_ITEM_TOO_LARGE', 'TBR_PATH_INVALID', 'TBR_UNSAFE_CONTENT', 'TBR_COLLISION'].includes(error?.code) ? error.code : 'TBR_WRITE_FAILED'; }
export function writeTbr({ root, identity, findings }) {
  try {
    if (!validIdentity(identity) || !Array.isArray(findings) || findings.length > 20) fail('TBR_INVALID');
    if (!findings.every(validFinding) || new Set(findings.map((finding) => finding.findingId)).size !== findings.length) fail('TBR_ITEM_INVALID');
    const requested = findings.map((finding) => itemFor(identity, finding));
    if (requested.some((item) => Buffer.byteLength(renderTbrItem(item), 'utf8') > 8192)) fail('TBR_ITEM_TOO_LARGE');
    const safeRoot = canonicalRoot(root), dir = secureDir(safeRoot, ['wiki', 'tbr', 'items']), canonical = readCanonicalItems(dir); let created = false; const items = [];
    for (const candidate of requested) {
      const existing = canonical.get(candidate.stableTbrId);
      if (existing) { for (const field of ['stableTbrId', 'originPlan', 'originRun', 'originGate', 'sourceFindingId']) if (existing[field] !== candidate[field]) fail('TBR_COLLISION'); items.push(existing); continue; }
      const file = `${candidate.stableTbrId}-${slug(candidate.title)}.md`; atomicWrite(path.join(dir, file), renderTbrItem(candidate)); const stored = { ...candidate, file }; canonical.set(candidate.stableTbrId, stored); items.push(stored); created = true;
    }
    writeIndex(safeRoot, canonical.values()); return { ok: true, created, items };
  } catch (error) { return { ok: false, code: codeFor(error) }; }
}
export function promoteTbr({ root, stableTbrId, userSelected, roadmapLink, promotedAt = new Date().toISOString() }) {
  try {
    if (userSelected !== true || !/^\[\[wiki\/roadmap\/candidates\/TBR-[a-f0-9]{12}\]\]$/.test(roadmapLink || '') || !text(promotedAt, 40)) fail('TBR_INVALID');
    const safeRoot = canonicalRoot(root), dir = secureDir(safeRoot, ['wiki', 'tbr', 'items']), items = readCanonicalItems(dir), item = items.get(stableTbrId); if (!item) fail('TBR_ITEM_INVALID');
    const tombstone = { ...item, status: 'promoted', roadmapCandidate: roadmapLink, promotedAt }; atomicWrite(path.join(dir, item.file), renderTbrItem(tombstone)); items.set(stableTbrId, { ...tombstone, file: item.file }); writeIndex(safeRoot, items.values()); return { ok: true, file: item.file };
  } catch (error) { return { ok: false, code: codeFor(error) }; }
}
export function closeReviewWithTbr({ root, identity, outcome, write = writeTbr, complete }) {
  if (normalizeReviewVerdict(identity?.reviewGate, outcome?.verdict) === 'APPROVED') return { status: 'accepted' };
  const checked = validateReviewOutcome(outcome, identity?.reviewGate); if (!checked.ok) return { status: 'TBR_WRITE_BLOCKED' };
  const written = write({ root, identity, findings: checked.value.immediateTbr }); if (!written?.ok) return { status: 'TBR_WRITE_BLOCKED' };
  if (typeof complete === 'function' && complete('closed')?.status !== 'closed') return { status: 'TBR_WRITE_BLOCKED' }; return { status: 'CLOSED_WITH_TBR' };
}
