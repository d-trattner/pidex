#!/usr/bin/env node
import assert from 'node:assert/strict';
import React from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const mockQueryId = '\0pidex-rule-provenance-query';
let provenance;
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
  plugins: [{
    name: 'pidex-rule-provenance-query', enforce: 'pre',
    resolveId(source) { return source.endsWith('/lib/client/use-dashboard-query') || source.endsWith('../lib/client/use-dashboard-query') ? mockQueryId : null; },
    load(id) { if (id !== mockQueryId) return null; return `export function useDashboardQuery(key) { const data = key[0] === 'quality-contract-governor' ? { ok: true, status: 'pending', capability: 'manual-pending-only', runs: [], pending: [], approved: [], rule_provenance: globalThis.__pidexRuleProvenance, impact_evidence: globalThis.__pidexImpactEvidence, publication_status: globalThis.__pidexPublicationStatus } : undefined; return { data, isLoading: key[0] === 'quality-contract-governor' && globalThis.__pidexPublicationLoading === true, isError: false, isFetching: false, refetch: async () => ({ data }) }; }`; },
  }],
});

const verifiedPublication = { transaction_digest: 'a'.repeat(64), rule_id: 'pidex-global:pidex-implementer:quality', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', handoff_stage: 'status_ready', receipt_digest: 'b'.repeat(64), accepted_commit: 'c'.repeat(40), content_hash: 'd'.repeat(64), activation_epoch: 'epoch:eeeeeeeeeeeeeeeeeeeeeeee', proposal_label: 'Generated candidate — not authority', inspect: true, refinement: true, refinement_reason: null, visible_label: 'Published and verified', fallback: null };
const rejectedPublication = { transaction_digest: 'f'.repeat(64), rule_id: `project:${'1'.repeat(24)}:pidex-implementer:quality`, tier: 'project', scope_id: '1'.repeat(24), state: 'rejected_policy', policy_category: 'privacy', handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, activation_epoch: null, proposal_label: 'Generated candidate — not authority', inspect: true, refinement: false, refinement_reason: 'Refinement requests are unavailable for this rule.', visible_label: 'Rejected by policy', fallback: null };

async function renderProvenance(value, publicationStatus = { status: 'available', publications: [verifiedPublication, rejectedPublication] }, loading = false) {
  provenance = value;
  globalThis.__pidexRuleProvenance = provenance;
  globalThis.__pidexPublicationStatus = publicationStatus;
  globalThis.__pidexPublicationLoading = loading;
  const { getRouter } = await server.ssrLoadModule('/app/router.tsx');
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: ['/quality'] }) });
  await router.load();
  const stream = await renderToReadableStream(React.createElement(RouterProvider, { router }));
  await stream.allReady;
  return new Response(stream).text();
}

try {
  const verified = await renderProvenance({ status: 'verified', reason_code: null, rules: [{ rule_id: 'pidex-global:pidex-implementer:quality', display_label: 'quality', tier_scope_label: 'Global', accepted_commit: 'aaaaaaaaaaaa', activation_epoch: 'epoch:dashboard', protection_class: 'none', lifecycle_state: 'active' }] });
  assert.match(verified, /Rule publication/);
  assert.match(verified, /Read-only publication status for generated candidates and verified canonical rules\./);
  assert.match(verified, /Generated candidate — not authority/);
  assert.match(verified, /aria-label="Global rule publication table"/);
  assert.match(verified, /aria-label="Project rule publication table"/);
  assert.match(verified, /<th>Rule<\/th><th>Publication status<\/th><th>Policy category<\/th>/);
  assert.match(verified, /Published and verified/);
  assert.match(verified, /Rejected by policy/);
  assert.match(verified, /aria-hidden="true"/);
  assert.match(verified, />privacy</);
  assert.doesNotMatch(verified, /raw_reason|terminal_reason/);
  assert.match(verified, /Inspect/);
  assert.ok(verified.indexOf('<h3>Rule lifecycle provenance</h3>') < verified.indexOf('<h3>Rule publication</h3>'));
  assert.ok(verified.indexOf('<h3>Rule publication</h3>') < verified.indexOf('<h3>Observational evidence</h3>'));
  const publicationPanel = verified.slice(verified.indexOf('<h3>Rule publication</h3>'), verified.indexOf('</article>', verified.indexOf('<h3>Rule publication</h3>')));
  assert.doesNotMatch(publicationPanel, /approve|accept(?!ed)|activate|deactivate|pin|editor|textarea/i);

  assert.match(verified, /Rule lifecycle provenance/);
  assert.match(verified, /Rule state synchronized/);
  assert.match(verified, />quality</);
  assert.match(verified, />Global</);
  assert.match(verified, />aaaaaaaaaaaa</);
  assert.match(verified, />epoch:dashboard</);
  assert.match(verified, />active</);
  assert.match(verified, /<th>Rule<\/th><th>Tier<\/th><th>Commit<\/th><th>Epoch<\/th><th>Protection<\/th><th>State<\/th>/);
  assert.match(verified, /aria-label="Rule lifecycle provenance table"/);
  const provenancePanel = verified.slice(verified.indexOf('<h3>Rule lifecycle provenance</h3>'), verified.indexOf('</article>', verified.indexOf('<h3>Rule lifecycle provenance</h3>')));
  assert.doesNotMatch(provenancePanel, /<button/);

  const degraded = await renderProvenance({ status: 'degraded', reason_code: 'rule_lifecycle_projection_degraded', rules: [{ rule_id: 'pidex-global:pidex-implementer:seed', display_label: 'seed', tier_scope_label: 'Global', accepted_commit: 'bbbbbbbbbbbb', activation_epoch: 'epoch:seed', protection_class: 'legacy_baseline', lifecycle_state: 'active' }] });
  assert.match(degraded, /Rule state degraded; affected managed rules excluded/);
  assert.match(degraded, /rule_lifecycle_projection_degraded/);
  assert.match(degraded, />seed</);
  assert.match(degraded, />active</);

  const unavailable = await renderProvenance({ status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] });
  assert.match(unavailable, /Rule state unavailable/);
  assert.match(unavailable, /No rule provenance available\./);

  globalThis.__pidexImpactEvidence = { status: 'available', reason_code: null, tiers: { global: [{ tier: 'global', rule_label: 'Measured rule', policy: 'Passive impact', state: 'repeated_observational_harm', reason: 'repeated_observational_harm', created_at: '2026-08-13T00:00:00.000Z', expires_at: '2026-09-13T00:00:00.000Z', closed_window_id: 'window-1', collection_progress: null, cohorts: { H2: { start_at: '2025-11-02T00:00:00.000Z', end_at: '2025-12-02T00:00:00.000Z', count: 31, ess: 30, plan_count: 5, diversity_kind: 'evaluator_host_project_scope', diversity_count: 2, support_ratio: { numerator: 8, denominator: 10, value: 0.8 }, missing_rate: { numerator: 0, denominator: 10, value: 0 }, evidence_exclusion_rate: { numerator: 1, denominator: 10, value: 0.1 }, exclusions: [{ reason: 'unsupported_stratum', count: 1 }] }, H1: { start_at: '2025-12-02T00:00:00.000Z', end_at: '2026-01-01T00:00:00.000Z', count: 32, ess: 31, plan_count: 5, diversity_kind: 'evaluator_host_project_scope', diversity_count: 2, support_ratio: { numerator: 8, denominator: 10, value: 0.8 }, missing_rate: { numerator: 0, denominator: 10, value: 0 }, evidence_exclusion_rate: { numerator: 0, denominator: 10, value: 0 }, exclusions: [] }, W1: { start_at: '2026-01-01T00:00:00.000Z', end_at: '2026-01-31T00:00:00.000Z', count: 33, ess: 32, plan_count: 5, diversity_kind: 'evaluator_host_project_scope', diversity_count: 2, support_ratio: { numerator: 8, denominator: 10, value: 0.8 }, missing_rate: { numerator: 0, denominator: 10, value: 0 }, evidence_exclusion_rate: { numerator: 0, denominator: 10, value: 0 }, exclusions: [] }, W2: { start_at: '2026-01-31T00:00:00.000Z', end_at: '2026-03-02T00:00:00.000Z', count: 34, ess: 33, plan_count: 5, diversity_kind: 'evaluator_host_project_scope', diversity_count: 2, support_ratio: { numerator: 8, denominator: 10, value: 0.8 }, missing_rate: { numerator: 0, denominator: 10, value: 0 }, evidence_exclusion_rate: { numerator: 0, denominator: 10, value: 0 }, exclusions: [] } }, floors: { minimum_count: 30, minimum_ess: 30, minimum_plan_count: 5, minimum_diversity_count: 2 }, quality_flags: ['quality-verified'] }], project: [{ tier: 'project', rule_label: 'Measured rule', policy: 'Project passive impact', state: 'inconclusive', reason: 'plan_diversity_below_floor', created_at: '2026-08-14T00:00:00.000Z', expires_at: null, closed_window_id: 'window-2', collection_progress: null, cohorts: {}, floors: { minimum_count: 30, minimum_ess: 30, minimum_plan_count: 5, minimum_diversity_count: 2 }, quality_flags: ['support-missing'] }, { tier: 'project', rule_label: 'Measured rule', policy: 'Project passive impact', state: 'superseded', reason: 'result_replaced', created_at: '2026-08-15T00:00:00.000Z', expires_at: null, closed_window_id: null, collection_progress: null, cohorts: {}, floors: {}, quality_flags: [] }] } };
  const evidence = await renderProvenance({ status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] });
  assert.match(evidence, /Observational evidence/);
  assert.match(evidence, /Repeated observational harm/);
  assert.match(evidence, /Observational evidence inconclusive; no lifecycle action authorized/);
  assert.match(evidence, /Residual confounding and temporal change may remain\. This evidence is not causal proof\./);
  assert.match(evidence, /aria-label="Global observational evidence table"/);
  assert.match(evidence, /aria-label="Project observational evidence table"/);
  assert.match(evidence, /aria-label="Cohort detail"/);
  assert.match(evidence, /H2[\s\S]*-60 to -30 days/);
  assert.match(evidence, /2025-11-02T00:00:00.000Z[\s\S]*2025-12-02T00:00:00.000Z/);
  assert.match(evidence, /2026-01-31T00:00:00.000Z[\s\S]*2026-03-02T00:00:00.000Z/);
  assert.doesNotMatch(evidence, /-60 to -30 minutes|2025-12-31T23:00:00.000Z|2026-01-01T00:30:00.000Z/, 'rendered evidence rejects minute/hour semantics');
  assert.match(evidence, /Count[\s\S]*31[\s\S]*ESS[\s\S]*30[\s\S]*plans[\s\S]*5[\s\S]*diversity[\s\S]*2/);
  assert.match(evidence, /Support[\s\S]*80\.0%[\s\S]*Missing[\s\S]*0\.0%[\s\S]*Exclusions[\s\S]*10\.0%/);
  assert.match(evidence, /Unsupported stratum[\s\S]*1/);
  assert.match(evidence, /None/);
  assert.match(evidence, /count 30 · ESS 30 · plans 5 · diversity 2/);
  assert.match(evidence, /quality-verified/);
  assert.match(evidence, /Evidence expired/);
  assert.match(evidence, /2026-08-15T00:00:00.000Z/);
  assert.match(evidence, /2026-09-13T00:00:00.000Z/);
  const evidencePanel = evidence.slice(evidence.indexOf('<h3>Observational evidence</h3>'), evidence.indexOf('</article>', evidence.indexOf('<h3>Observational evidence</h3>')));
  assert.doesNotMatch(evidencePanel, /<button|do-not-leak|private|secret|passive-impact-(?:global|project):/);

  const fixture = (digestChar, slug, state, visible_label, extras = {}) => ({
    transaction_digest: digestChar.repeat(64), rule_id: `pidex-global:pidex-implementer:${slug}`, tier: 'global', state, visible_label, inspect: false, refinement: false, ...extras,
  });
  const matrix = await renderProvenance({ status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] }, {
    status: 'available',
    publications: [
      fixture('1', 'prepared-rule', 'prepared', 'Prepared'),
      fixture('2', 'committed-rule', 'committed_local', 'Publication pending'),
      fixture('3', 'accepted-pending-rule', 'accepted_remote', 'Publication pending'),
      fixture('4', 'verified-rule', 'accepted_remote', 'Published and verified', { handoff_stage: 'status_ready', receipt_digest: '5'.repeat(64), accepted_commit: '6'.repeat(40), content_hash: '7'.repeat(64), activation_epoch: 'epoch:888888888888888888888888', inspect: true, refinement: true }),
      fixture('9', 'tx04-rule', 'deferred_remote_advanced', 'Deferred — source changed'),
      fixture('a', 'tx05-rule', 'rejected_policy', 'Rejected by policy', { policy_category: 'unallowlisted-category' }),
      fixture('b', 'tx06-rule', 'abandoned', 'Abandoned'),
      fixture('c', 'unknown-state-rule', 'future_state', 'raw upstream state', { inspect: true, refinement: true, private_path: '/private/path', raw_error: 'do-not-leak' }),
      fixture('d', 'unknown-tier-rule', 'prepared', 'Prepared', { tier: 'future-tier', policy_category: 'raw-category' }),
    ],
  });
  for (const [glyph, label] of [['…', 'Prepared'], ['…', 'Publication pending'], ['✓', 'Published and verified'], ['!', 'Deferred — source changed'], ['!', 'Rejected by policy'], ['—', 'Abandoned']]) {
    assert.match(matrix, new RegExp(`<span aria-hidden="true">${glyph}</span> (?:<!-- -->)?${label.replaceAll('—', '—')}`), `renders exact ${label} glyph and label`);
  }
  assert.match(matrix, /Category unavailable/, 'unallowlisted policy category falls back');
  assert.doesNotMatch(matrix, /unallowlisted-category|raw-category|future_state|raw upstream state|\/private\/path|do-not-leak/, 'raw upstream fields never render');
  assert.match(matrix, /Scope unavailable[\s\S]*Status unavailable/, 'unknown tier has bounded scope/status fallback');
  const unknownStateRow = matrix.slice(matrix.indexOf('unknown-state-rule') - 250, matrix.indexOf('unknown-state-rule') + 500);
  assert.match(unknownStateRow, /Status unavailable/);
  assert.doesNotMatch(unknownStateRow, /Inspect|Request refinement|Published and verified|<span aria-hidden="true">✓<\/span>/, 'unknown state has no unsafe action or verified claim');

  for (const missing of ['receipt_digest', 'accepted_commit', 'content_hash', 'activation_epoch', 'handoff_stage']) {
    const fake = { ...verifiedPublication, transaction_digest: `${missing[0]}`.repeat(64), rule_id: `pidex-global:pidex-implementer:missing-${missing.replaceAll('_', '-')}`, [missing]: missing === 'handoff_stage' ? null : null };
    const rendered = await renderProvenance({ status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] }, { status: 'available', publications: [fake] });
    const row = rendered.slice(rendered.indexOf(fake.rule_id) - 250, rendered.indexOf(fake.rule_id) + 500);
    assert.doesNotMatch(row, /<span aria-hidden="true">✓<\/span>|Published and verified|Inspect|Request refinement|Receipt/, `${missing} fake verification has no verified glyph, receipt, or refinement`);
  }

  const empty = await renderProvenance({ status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] }, { status: 'available', publications: [] });
  assert.match(empty, /No publication records available\./);
  const unavailablePublication = await renderProvenance({ status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] }, { status: 'unavailable', publications: [] });
  assert.match(unavailablePublication, /Publication status unavailable/);
  const loadingPublication = await renderProvenance({ status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] }, { status: 'available', publications: [] }, true);
  assert.match(loadingPublication, /Loading publication status…/);

  const qualitySource = await (await import('node:fs/promises')).readFile(new URL('../routes/quality.tsx', import.meta.url), 'utf8');
  const detailFields = ['Rule', 'Stable identity', 'Tier', 'Owner', 'Proposal authority', 'Publication status', 'Content digest', 'Admission digest', 'Transaction digest', 'Predecessor commit', 'Receipt', 'Policy category'];
  let previous = -1;
  for (const field of detailFields) { const next = qualitySource.indexOf(`['${field}'`, previous + 1); assert.ok(next > previous, `safe opened-detail field ${field} remains ordered`); previous = next; }
  assert.match(qualitySource, /publicationDetail\.visible_label === 'Published and verified' \? 'Published and verified' : 'Receipt unavailable'/, 'detail receipt has verified and fallback copy');
  const announcementStart = qualitySource.indexOf('publicationAnnouncement ? <p');
  const publicationDetailStart = qualitySource.indexOf('className="quality-publication-detail"');
  assert.ok(announcementStart > qualitySource.indexOf('<h3>Rule publication</h3>') && announcementStart < publicationDetailStart, 'announcement state renders in publication card outside detail');
  assert.match(qualitySource, /role=\{publicationAnnouncement\.kind\}/, 'SSR/state harness preserves status and alert announcement roles');
  assert.doesNotMatch(qualitySource.slice(announcementStart, publicationDetailStart), /Request refinement|Submit request/, 'announcement locus contains no stale request controls');
} finally { await server.close(); }

console.log('rendered quality rule provenance states passed');
