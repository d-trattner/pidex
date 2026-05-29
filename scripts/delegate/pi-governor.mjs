#!/usr/bin/env node
// PIDEX Pi delegate boundary for background contract-governor model calls.
// First implementation is deterministic schema validation / pending-only stub unless model execution is added.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parse(argv) { const out = { packet: '', output: '', decision: '', model: '', provider: '', effort: 'medium', timeoutSeconds: '60' }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i]; else { console.error(`Unknown arg: ${a}`); process.exit(2); } } return out; }
function writeJson(file, data) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8'); }
const args = parse(process.argv.slice(2));
try {
  if (!args.packet || !existsSync(args.packet) || !args.decision) throw new Error('--packet and --decision are required');
  const packet = JSON.parse(readFileSync(args.packet, 'utf8'));
  const proposal = packet.proposals?.[0] || packet.proposal || packet;
  const forbidden = proposal.forbidden_changes_check || {};
  const blocked = forbidden.touches_security_gate || forbidden.touches_release_gate || forbidden.removes_required_operator || forbidden.broadens_skip_reasons;
  const decision = {
    proposal_id: proposal.proposal_id || proposal.id || 'unknown-proposal',
    decision: blocked ? 'request_more_evidence' : 'approve',
    scope: 'local',
    risk: blocked ? 'medium' : 'low',
    confidence: blocked ? 'medium' : 'medium',
    effective_from: 'now',
    historical_reclassification: 'future-only',
    reason: blocked ? 'Forbidden-change guard requires more evidence/manual review.' : 'Deterministic pi-governor delegate approved a narrow local proposal for pending/low-risk flow.',
    required_follow_up: blocked ? ['manual-review'] : [],
    allowed_to_auto_apply: !blocked,
    provider: args.provider || null,
    model: args.model || null,
  };
  writeJson(args.decision, decision);
  if (args.output) { mkdirSync(path.dirname(args.output), { recursive: true }); writeFileSync(args.output, `# Contract Governor Decision\n\n${decision.decision}: ${decision.reason}\n`, 'utf8'); }
  console.log(JSON.stringify({ ok: true, decision: args.decision }));
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
