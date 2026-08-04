#!/usr/bin/env node
// Plan 059 Slice 4 — policy parity test suite (RED-first).
// Verifies every public instruction/consumer agrees with the typed runtime truth:
//  1. SKILL/rules/docs: valid in-contract initial rejection auto-routes correction1,
//     valid review1 rejection auto-routes correction2 (no user gate), review2 rejection
//     uses typed CLOSED_WITH_TBR and advances exactly once; no correction3/review3;
//     ordinary rejection count alone never asks the user; Circuit Breaker remains only
//     for typed expansion (USER_DECISION_REQUIRED), lifecycle/authority uncertainty,
//     TBR failure, repeated non-substantive stalls, and G9/release/project boundary.
//  2. Reviewer producer contracts (critic/code-review/security/qa) require exactly one
//     bounded pidex-review-outcome-v1 block in the exact assigned artifact with the
//     correct gate verdict, full disposition enum, findings schema and immediate-TBR
//     classification; corrections remain no-structured-payload and route back to the
//     reviewer; rendered rules in host-direct/hardened-pipeline/project-pipeline modes
//     receive the contract.
//  3. Typed reviewCompletion is authoritative over contradictory ROUTING; exact statuses
//     are exposed safely (no paths/secrets).
//  4. State-root env names reconciled under a single supported override with documented
//     precedence (PIDEX_STATE_DIR > RUNNING_PI_STATE_DIR > <root>/state).
//  5. readme/review-budgets updated from review2 TBR_WRITE_BLOCKED-separate semantics to
//     automatic durable terminalization; TBR_WRITE_BLOCKED remains persistence/validation
//     failure only.
//  6. G9/release/user authority unchanged; no budget reset; no conflicting stop text.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { validateStructuredReviewOutcome } from '../quality/structured-review.mjs';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const SKILL = read('skills/pidex/SKILL.md');
const REVIEW_BUDGETS = read('readme/review-budgets.md');
const MODES = read('readme/modes.md');
const REVIEWER_AGENTS = ['pidex-critic', 'pidex-code-reviewer', 'pidex-security', 'pidex-qa'];
const REVIEWER_PHASES = { 'pidex-critic': 'critic-review', 'pidex-code-reviewer': 'code-review', 'pidex-security': 'security', 'pidex-qa': 'qa' };
const EXECUTION_MODES = ['host-direct', 'hardened-pipeline', 'project-pipeline'];
const DISPOSITION_ENUM = ['in_contract', 'scope_expansion', 'architecture_expansion', 'acceptance_expansion', 'evidence_expansion', 'threat_model_expansion'];

// ---------------------------------------------------------------------------
// 1. SKILL parity — no conflicting second-rejection stop text; auto-corrections;
// review2 terminal CLOSED_WITH_TBR; breaker retained only for the listed stops.
// ---------------------------------------------------------------------------
assert.doesNotMatch(SKILL, /second rejection at the same gate/, 'SKILL must not stop on a numeric second rejection at the same gate');
assert.doesNotMatch(SKILL, /stop before spawning another planner, architect, implementer, or reviewer/, 'SKILL must not keep the numeric second-rejection stop');
assert.doesNotMatch(SKILL, /review2` rejection remains returned uncertainty/, 'SKILL must not claim review2 rejection is returned uncertainty');
assert.match(SKILL, /auto-routes/, 'SKILL must state valid in-contract rejections auto-route the bounded corrections');
assert.match(SKILL, /without a user gate/, 'SKILL must state valid in-contract rejections proceed without a user gate');
assert.match(SKILL, /CLOSED_WITH_TBR/, 'SKILL must surface the review2 terminal typed status CLOSED_WITH_TBR');
assert.match(SKILL, /USER_DECISION_REQUIRED/, 'SKILL must keep the typed expansion stop USER_DECISION_REQUIRED');
assert.match(SKILL, /TBR_WRITE_BLOCKED/, 'SKILL must keep TBR_WRITE_BLOCKED as the persistence/validation failure stop');
assert.match(SKILL, /non-substantive stalls/, 'SKILL must keep the repeated non-substantive stall breaker');
assert.match(SKILL, /typed (?:completion )?status is authoritative/, 'SKILL must declare typed completion status authoritative over ROUTING text');
assert.match(SKILL, /review2/, 'SKILL lifecycle policy still covers review2');
assert.doesNotMatch(SKILL, /(?:spawn|dispatch|invoke|route|request)\s+(?:a\s+)?(?:correction\s*3|review\s*3)/i, 'no instruction may request correction3/review3');
assert.match(SKILL, /No declared-mode split, legacy second-rejection override, or user choice may raise or reset a gate's budget/, 'budget non-reset prohibition retained');

// G9/release/user authority unchanged.
assert.match(SKILL, /G9 \(preview verification\)/, 'G9 preview gate text unchanged');
assert.match(SKILL, /asks? the user to verify visually/, 'G9 user approval gate unchanged');
assert.match(SKILL, /rules\/orchestrator\/g9-rejection-playwright-repro\.md/, 'G9 rejection repro rule still wired');
assert.match(SKILL, /Ready to tag and release\? push \/ local \/ hold \/ abort/, 'G4 release gate unchanged');

// ---------------------------------------------------------------------------
// 2. Reviewer producer contracts — one bounded pidex-review-outcome-v1 block in
// the exact assigned artifact; corrections no-structured-payload and route back.
// ---------------------------------------------------------------------------
const SHARED_RULE = 'rules/shared/structured-review-outcome.md';
assert.equal(existsSync(path.join(ROOT, SHARED_RULE)), true, `shared structured-review-outcome producer contract must exist: ${SHARED_RULE}`);
function extractPidexProducerBlocks(source) {
  const lines = source.split(/\r?\n/);
  const openFence = '```pidex-review-outcome-v1';
  const closeFence = '```';
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index] !== openFence) {
      index += 1;
      continue;
    }
    const nextClose = lines.indexOf(closeFence, index + 1);
    if (nextClose === -1) return { ok: false, code: 'unterminated' };
    blocks.push(lines.slice(index + 1, nextClose).join('\n'));
    index = nextClose + 1;
  }
  return { ok: true, blocks };
}

function assertSingleProducerBlock(source) {
  const extracted = extractPidexProducerBlocks(source);
  assert.equal(extracted.ok, true, 'producer contract must contain a closed pidex-review-outcome-v1 fenced block');
  assert.equal(extracted.blocks.length, 1, 'producer contract requires exactly one pidex-review-outcome-v1 block');
  const parsed = JSON.parse(extracted.blocks[0]);
  const checked = validateStructuredReviewOutcome(parsed, 'code-review', { archiveActive: true });
  assert.equal(checked.ok, true, `shared rule JSON example must pass validator semantics at review2 (active findings need archive fields): ${checked.code || 'ok'}`);
}

const shared = read(SHARED_RULE);
assert.match(shared, /pidex-review-outcome-v1/, 'producer contract names the exact fenced block tag');
assert.match(shared, /exactly one/, 'producer contract requires exactly one bounded block');
assert.match(shared, /assigned (?:review )?artifact/, 'producer contract binds the exact assigned artifact');
assert.match(shared, /```\s*pidex-review-outcome-v1/, 'producer contract includes the fenced template');
for (const disposition of DISPOSITION_ENUM) assert.match(shared, new RegExp(disposition), `producer contract lists disposition ${disposition}`);
assert.match(shared, /tbr_immediate/, 'producer contract teaches immediate-TBR classification');
assert.match(shared, /no structured payload/, 'producer contract states corrections carry no structured payload');
assert.match(shared, /route back/, 'producer contract routes corrections back to the reviewer');
assert.doesNotMatch(shared, /(?:findings\s*\|\s*20|severity\s*\|\s*)/i, 'producer contract must not duplicate the validator schema');
for (const agent of REVIEWER_AGENTS) {
  const index = read(`rules/${agent}/index.md`);
  assert.match(index, /structured-review-outcome/, `${agent} rules index must reference the structured-review-outcome producer contract`);
  const definition = read(`agents/${agent}.md`);
  assert.match(definition, /structured-review-outcome/, `${agent} agent definition must load the structured-review-outcome producer contract`);
}

// Plan 059 Slice 4 (item): the shared rule JSON example itself must pass the current
// validator semantics — including review2 archiveActive (active findings carry full
// archive fields) and unsafe-content/path limits — so a reviewer copying it never
// emits invalid output. The doc may not ship a template that validates as invalid.
assert.doesNotMatch(shared, /\/tmp\/|\/home\/|C:\\Users/, 'producer contract example must not show absolute host paths');
assertSingleProducerBlock(shared);
assertSingleProducerBlock(shared.replace(/\r?\n/g, '\r\n'));
const duplicateProducer = [
  'header',
  '```pidex-review-outcome-v1',
  '{}',
  '```',
  '```pidex-review-outcome-v1',
  '{}',
  '```',
].join('\n');
assert.equal(extractPidexProducerBlocks(duplicateProducer).ok, true, 'duplicate fixture parses to two fenced blocks');
assert.throws(() => assertSingleProducerBlock(duplicateProducer), /exactly one/ , 'duplicate pidex-review-outcome-v1 fences must be rejected');

// ---------------------------------------------------------------------------
// 3. Rendered rules receive the producer contract in every execution mode.
// ---------------------------------------------------------------------------
const moduleManifest = JSON.parse(read('modules/pidex/analysis-metrics-history/module.json'));
const structuredRules = (moduleManifest.agent_rules || []).filter((rule) => String(rule.id).includes('structured-review-outcome'));
assert.equal(structuredRules.length, 4, 'module manifest registers structured-review-outcome for all four reviewer agents');
for (const rule of structuredRules) assert.equal(rule.authority, 'module-scoped', `${rule.id} must be module-scoped`);
const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-policy-parity-project-'));
try {
  for (const agent of REVIEWER_AGENTS) {
    const phase = REVIEWER_PHASES[agent];
    for (const mode of EXECUTION_MODES) {
      const rendered = execFileSync(process.execPath, ['scripts/modules/render-rules.mjs', '--pidex-root', ROOT, '--agent', agent, '--phase', phase, '--project', project, '--mode', mode], { cwd: ROOT, encoding: 'utf8' });
      assert.match(rendered, /structured-review-outcome/, `${agent} rendered rules must include the producer contract in ${mode} mode`);
      const context = execFileSync(process.execPath, ['scripts/modules/context.mjs', '--agent', agent, '--phase', phase, '--project', project, '--mode', mode], { cwd: ROOT, encoding: 'utf8' });
      assert.match(context, /structured-review-outcome/, `${agent} module-rule metadata must list the producer contract in ${mode} mode`);
    }
  }
} finally { rmSync(project, { recursive: true, force: true }); }

// ---------------------------------------------------------------------------
// 5. readme/review-budgets parity — automatic durable terminalization; the old
// review2 TBR_WRITE_BLOCKED-separate semantics are gone; TBR_WRITE_BLOCKED is
// persistence/validation failure only.
// ---------------------------------------------------------------------------
assert.doesNotMatch(REVIEW_BUDGETS, /keeps durable returned uncertainty/, 'review-budgets must not keep review2 returned-uncertainty semantics');
assert.doesNotMatch(REVIEW_BUDGETS, /TBR serialization remains a separate operation and must succeed independently/, 'review-budgets must not separate TBR serialization from review2 completion');
assert.match(REVIEW_BUDGETS, /CLOSED_WITH_TBR/, 'review-budgets must name the terminal CLOSED_WITH_TBR status');
assert.match(REVIEW_BUDGETS, /TBR_WRITE_BLOCKED[\s\S]{0,200}(persistence|validation)/, 'TBR_WRITE_BLOCKED in review-budgets must be persistence/validation failure only');
assert.doesNotMatch(MODES, /second rejection[\s\S]{0,60}stop/i, 'modes.md must not instruct a second-rejection stop for tracked reviews');

// ---------------------------------------------------------------------------
// 4. State-root env reconciliation — single supported override with documented
// precedence (canonical PIDEX_STATE_DIR, legacy RUNNING_PI_STATE_DIR alias).
// ---------------------------------------------------------------------------
const STATE_ROOT_LIB = 'modules/pidex/analysis-metrics-history/lib/state-root.mjs';
assert.equal(existsSync(path.join(ROOT, STATE_ROOT_LIB)), true, `state-root resolver must exist: ${STATE_ROOT_LIB}`);
const stateRootSource = read(STATE_ROOT_LIB);
assert.match(stateRootSource, /PIDEX_STATE_DIR/, 'state-root resolver honors the canonical PIDEX_STATE_DIR override');
assert.match(stateRootSource, /RUNNING_PI_STATE_DIR/, 'state-root resolver honors the legacy RUNNING_PI_STATE_DIR alias');
assert.match(stateRootSource, /PIDEX_STATE_DIR[\s\S]{0,120}RUNNING_PI_STATE_DIR/, 'state-root resolver documents PIDEX_STATE_DIR precedence over RUNNING_PI_STATE_DIR');
// User-facing documentation must state the same precedence so operators of every
// execution mode (host-direct, hardened-pipeline, project-pipeline) can rely on one
// supported override without reading the resolver source.
const MODES_DOC = read('readme/modes.md');
assert.match(MODES_DOC, /PIDEX_STATE_DIR/, 'readme/modes.md must document the canonical PIDEX_STATE_DIR state-root override');
assert.match(MODES_DOC, /RUNNING_PI_STATE_DIR/, 'readme/modes.md must document the legacy RUNNING_PI_STATE_DIR alias');
assert.match(MODES_DOC, /PIDEX_STATE_DIR[\s\S]{0,200}RUNNING_PI_STATE_DIR/, 'readme/modes.md must document PIDEX_STATE_DIR precedence over RUNNING_PI_STATE_DIR');
assert.match(MODES_DOC, /<root>\/state/, 'readme/modes.md must document the default state root <root>/state');

// 4b. State-root consumer unification — every state-root consumer resolves through
// the shared helper (PIDEX_STATE_DIR > RUNNING_PI_STATE_DIR > <root>/state) so the
// host lifecycle, CLI, event pipeline, dashboard ingest, metrics record, and the
// project TBR serialization lock can never diverge under a single supported override.
import { resolveStateRoot } from '../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';
assert.equal(resolveStateRoot({ root: '/repo-root' }), path.join('/repo-root', 'state'), 'default state root is <root>/state');
assert.equal(resolveStateRoot({ root: '/repo-root', env: { PIDEX_STATE_DIR: '/canonical', RUNNING_PI_STATE_DIR: '/legacy' } }), path.resolve('/canonical'), 'PIDEX_STATE_DIR takes precedence over RUNNING_PI_STATE_DIR');
assert.equal(resolveStateRoot({ root: '/repo-root', env: { RUNNING_PI_STATE_DIR: '/legacy' } }), path.resolve('/legacy'), 'legacy RUNNING_PI_STATE_DIR alias honored when canonical unset');
assert.equal(resolveStateRoot({ root: '/repo-root', env: { PIDEX_STATE_DIR: '', RUNNING_PI_STATE_DIR: '/legacy' } }), path.resolve('/legacy'), 'empty canonical override falls back to the legacy alias');
const STATE_CONSUMERS = [
  'extensions/pidex/index.ts',
  'modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs',
  'modules/pidex/analysis-metrics-history/scripts/metrics/record.mjs',
  'modules/pidex/analysis-metrics-history/scripts/metrics/summarize.mjs',
  'scripts/quality/orchestrator-events.mjs',
  'scripts/dashboard/ingest.mjs',
  'modules/pidex/project-pipeline/scripts/project-pipeline/archive-sync.mjs',
];
for (const consumer of STATE_CONSUMERS) assert.match(read(consumer), /resolveStateRoot/, `${consumer} must resolve its state root through the shared helper`);
// Shell history consumers mirror the same precedence (PIDEX_STATE_DIR > RUNNING_PI_STATE_DIR > <root>/state).
for (const shellConsumer of ['modules/pidex/analysis-metrics-history/scripts/history/append.sh', 'modules/pidex/analysis-metrics-history/scripts/history/list.sh']) {
  const source = read(shellConsumer);
  assert.match(source, /PIDEX_STATE_DIR/, `${shellConsumer} honors the canonical PIDEX_STATE_DIR override`);
  assert.match(source, /RUNNING_PI_STATE_DIR/, `${shellConsumer} honors the legacy RUNNING_PI_STATE_DIR alias`);
}

console.log('policy parity tests passed');
