#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const CLASSES = new Set(['Product', 'SharedContract', 'Evidence', 'Process', 'SideEffect']);
const SEVERITIES = new Set(['Critical', 'Security', 'High', 'Medium', 'Low', 'Info']);
const RELATIONS = new Set(['assigned', 'existing', 'new', 'fix_induced', 'fix-induced']);
const VERDICTS = new Set(['APPROVED', 'APPROVED_WITH_COMMENTS', 'APPROVED_WITH_CONTROLS', 'COMPLETE', 'REJECTED', 'FAILED', 'CHANGES_REQUESTED']);
function safe(value, limit) { return typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\0\r\n]/.test(value) && !path.isAbsolute(value) && !value.split('/').includes('..'); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'finding'; }
function canonicalRelation(value) { return value === 'existing' ? 'assigned' : value === 'fix-induced' ? 'fix_induced' : value; }
export function validateReviewOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object' || !VERDICTS.has(outcome.verdict) || !Array.isArray(outcome.findings) || outcome.findings.length > 20) return { ok: false, code: 'REVIEW_OUTCOME_INVALID' };
  const ids = new Set(), active = [], immediateTbr = [];
  for (const finding of outcome.findings) {
    const id = finding?.findingId ?? finding?.id, relation = canonicalRelation(finding?.relation);
    const reproduced = finding?.reproductionState === 'reproduced' || finding?.reproduced === true;
    const causal = finding?.causedByCorrection === true || finding?.causal === true;
    if (!safe(id, 80) || ids.has(id) || !RELATIONS.has(finding?.relation) || !CLASSES.has(finding?.class) || !SEVERITIES.has(finding?.severity) || typeof causal !== 'boolean' || !['reproduced', 'causal', 'not_reproduced', 'not_tested', undefined].includes(finding?.reproductionState) || typeof finding?.reproduced === 'boolean' && !reproduced) return { ok: false, code: 'REVIEW_FINDING_INVALID' };
    ids.add(id);
    const item = { ...finding, id, findingId: id, relation, reproductionState: reproduced ? 'reproduced' : finding?.reproductionState || 'not_tested', causedByCorrection: causal };
    if (relation === 'assigned' || (relation === 'fix_induced' && ['Product', 'SharedContract'].includes(item.class) && reproduced && causal && ['Critical', 'Security'].includes(item.severity))) active.push(item); else immediateTbr.push(item);
  }
  if (['REJECTED', 'FAILED', 'CHANGES_REQUESTED'].includes(outcome.verdict) && !active.length && !immediateTbr.length) return { ok: false, code: 'REVIEW_REJECTION_EMPTY' };
  return { ok: true, value: { verdict: outcome.verdict, active, immediateTbr } };
}
function itemFor(identity, finding) {
  const stable = `TBR-${createHash('sha256').update([identity.planId, identity.runFamilyId, identity.reviewGate, finding.findingId].join('\0')).digest('hex').slice(0, 12)}`;
  const title = String(finding.title || finding.findingId).slice(0, 120);
  return { stableTbrId: stable, status: 'open', title, shortDescription: String(finding.shortDescription || 'Deferred review finding.').slice(0, 500), originPlan: identity.planId, originRun: identity.runFamilyId, originGate: identity.reviewGate, findingClass: finding.class, proposedSeverity: finding.severity, reproductionState: finding.reproductionState, blockingScope: 'none', releaseRecommendation: ['Critical', 'Security'].includes(finding.severity) ? 'hold' : 'none', sourceFindingId: finding.findingId };
}
export function writeTbr({ root, identity, findings }) {
  if (!root || !identity || !Array.isArray(findings)) return { ok: false, code: 'TBR_INVALID' };
  try {
    const items = findings.map((finding) => itemFor(identity, finding));
    const dir = path.join(root, 'wiki', 'tbr', 'items'); mkdirSync(dir, { recursive: true });
    let created = false;
    for (const item of items) { const file = path.join(dir, `${item.stableTbrId}-${slug(item.title)}.md`); if (!existsSync(file)) { writeFileSync(file, `---\n${Object.entries(item).map(([k,v]) => `${k}: ${v}`).join('\n')}\n---\n\n${item.shortDescription}\n`, { mode: 0o600 }); created = true; } }
    const index = path.join(root, 'wiki', 'tbr', 'index.md'); const rows = items.map((item) => `| ${item.stableTbrId} | open | ${item.title} | ${item.findingClass} | ${item.proposedSeverity} | ${item.originPlan} | ${item.originGate} |`).sort();
    writeFileSync(index, `# TBR Archive\n\n| ID | Status | Title | Class | Severity | Plan | Gate |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`, { mode: 0o600 });
    return { ok: true, created, items };
  } catch { return { ok: false, code: 'TBR_WRITE_FAILED' }; }
}
export function closeReviewWithTbr({ root, identity, outcome, write = writeTbr, complete }) {
  if (outcome?.verdict === 'COMPLETE') return { status: 'accepted' };
  const checked = validateReviewOutcome(outcome); if (!checked.ok) return { status: 'TBR_WRITE_BLOCKED' };
  const written = write({ root, identity, findings: [...checked.value.active, ...checked.value.immediateTbr] });
  if (!written?.ok) return { status: 'TBR_WRITE_BLOCKED' };
  if (typeof complete === 'function' && complete('closed')?.status !== 'closed') return { status: 'TBR_WRITE_BLOCKED' };
  return { status: 'CLOSED_WITH_TBR' };
}
