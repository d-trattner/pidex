#!/usr/bin/env node
import { normalizeReviewVerdict } from '../../extensions/pidex/review-budget.ts';
import { validateReviewOutcome } from './tbr.mjs';

// Reviewer artifact contract (pidex-review-outcome-v1):
// - The assigned review artifact remains human-readable Markdown and MUST contain
//   exactly one fenced code block whose info string is exactly `pidex-review-outcome-v1`.
// - The block body is strict JSON with exactly the keys schemaVersion, verdict,
//   contractDisposition, findings.
// - Findings reuse the existing canonical finding schema from tbr.mjs validators
//   (identity, relation, class, reproduction, causality, severity, disposition,
//   bounded archive fields). No parallel schema/framework is introduced.
// - The artifact and payload are untrusted: bounded size, strict key sets, existing
//   unsafe-content/path/control checks, no credentials/absolute paths/raw logs.

export const STRUCTURED_SCHEMA_VERSION = 'pidex-review-outcome-v1';
export const STRUCTURED_BLOCK_TAG = 'pidex-review-outcome-v1';
export const CONTRACT_DISPOSITIONS = new Set(['in_contract', 'scope_expansion', 'architecture_expansion', 'acceptance_expansion', 'evidence_expansion', 'threat_model_expansion']);
export const STRUCTURED_PAYLOAD_MAX_BYTES = 128 * 1024;
const PAYLOAD_KEYS = new Set(['schemaVersion', 'verdict', 'contractDisposition', 'findings']);

export function extractStructuredPayload(text) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, code: 'STRUCTURED_OUTCOME_MISSING' };
  const blocks = [];
  const lines = text.split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith('```')) {
      const info = line.slice(3).trim();
      if (info === STRUCTURED_BLOCK_TAG) {
        const body = [];
        index += 1;
        while (index < lines.length && !lines[index].startsWith('```')) { body.push(lines[index]); index += 1; }
        if (index >= lines.length) return { ok: false, code: 'STRUCTURED_OUTCOME_PARSE' };
        blocks.push(body.join('\n'));
      } else {
        index += 1;
        while (index < lines.length && !lines[index].startsWith('```')) index += 1;
      }
    }
    index += 1;
  }
  if (blocks.length === 0) return { ok: false, code: 'STRUCTURED_OUTCOME_MISSING' };
  if (blocks.length > 1) return { ok: false, code: 'STRUCTURED_OUTCOME_DUPLICATE' };
  const raw = blocks[0];
  if (Buffer.byteLength(raw, 'utf8') > STRUCTURED_PAYLOAD_MAX_BYTES) return { ok: false, code: 'STRUCTURED_OUTCOME_TOO_LARGE' };
  let value;
  try { value = JSON.parse(raw); } catch { return { ok: false, code: 'STRUCTURED_OUTCOME_PARSE' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'REVIEW_OUTCOME_INVALID' };
  return { ok: true, value };
}

// Terminal classification (binding matrix):
// | verdict  | active | immediate | result |
// | approved | 0      | 0 or more | ok (archive immediate, close accepted) |
// | approved | 1+     | any       | invalid REVIEW_MATRIX_APPROVED_ACTIVE |
// | rejected | 1+     | any       | ok (non-final CHANGES_REQUESTED)       |
// | rejected | 0      | any       | invalid REVIEW_REJECTION_EMPTY         |
// Expansion dispositions bypass completion matrix rows: the review stops for an
// explicit user decision and never closes in this boundary.
// archiveActive: review2 completions require active findings to carry full archive
// evidence so the terminal boundary can archive every remaining finding (AD-2).
export function validateStructuredReviewOutcome(payload, reviewGate, { archiveActive = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, code: 'REVIEW_OUTCOME_INVALID' };
  if (Object.keys(payload).some((key) => !PAYLOAD_KEYS.has(key)) || [...PAYLOAD_KEYS].some((key) => !(key in payload))) return { ok: false, code: 'REVIEW_OUTCOME_INVALID' };
  if (payload.schemaVersion !== STRUCTURED_SCHEMA_VERSION) return { ok: false, code: 'REVIEW_SCHEMA_VERSION_INVALID' };
  if (!CONTRACT_DISPOSITIONS.has(payload.contractDisposition)) return { ok: false, code: 'REVIEW_DISPOSITION_INVALID' };
  if (!normalizeReviewVerdict(reviewGate, payload.verdict)) return { ok: false, code: 'REVIEW_OUTCOME_INVALID' };
  const checked = validateReviewOutcome({ verdict: payload.verdict, findings: payload.findings }, reviewGate, { archiveActive });
  if (!checked.ok) return checked;
  if (payload.contractDisposition === 'in_contract' && checked.value.verdict === 'APPROVED' && checked.value.active.length > 0) return { ok: false, code: 'REVIEW_MATRIX_APPROVED_ACTIVE' };
  return { ok: true, value: { ...checked.value, disposition: payload.contractDisposition, expansion: payload.contractDisposition !== 'in_contract' } };
}
