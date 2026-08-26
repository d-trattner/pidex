import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dashboardRoot = new URL('../routes/dashboard/', import.meta.url);
const rootRouteRoot = new URL('../routes/', import.meta.url);
const componentsRoot = new URL('../components/', import.meta.url);

const files = [
  'analysis.tsx',
  'limits.tsx',
  'live.tsx',
  'overview.tsx',
  'pipelines.tsx',
  'quality.tsx',
  'runs.tsx',
  'tokens.tsx',
];

const germanMarkers = [
  'Lade',
  'Keine',
  'konnte nicht',
  'öffnen',
  'Wähle',
  'Übersicht',
  'Aktives Profil',
  'Anwenden',
  'Zeitraum',
  'Hinweis',
  'Noch keine',
];

test('dashboard routes keep user-visible copy in English', async () => {
  for (const file of files) {
    const text = await readFile(join(dashboardRoot.pathname, file), 'utf8');
    for (const marker of germanMarkers) {
      assert.equal(text.includes(marker), false, `${file} still contains German marker: ${marker}`);
    }
  }
});

test('dashboard root route remains landing-only', async () => {
  const text = await readFile(join(rootRouteRoot.pathname, 'dashboard.tsx'), 'utf8');
  assert.doesNotMatch(text, /redirect\(\{\s*to:\s*'\/dashboard\/overview'/, 'dashboard root must not auto-redirect to /dashboard/overview');
});

test('root layout mounts shared header and mobile menu controls', async () => {
  const rootText = await readFile(join(rootRouteRoot.pathname, '__root.tsx'), 'utf8');
  assert.match(rootText, /GlobalHeader/, 'root layout should render GlobalHeader');
  assert.match(rootText, /MobileMenuSheet/, 'root layout should render MobileMenuSheet');

  const navText = await readFile(join(componentsRoot.pathname, 'navigation/global-nav.tsx'), 'utf8');
  assert.match(navText, /to:\s*'\/live'/, 'shared nav should include /live route');
  assert.match(navText, /label:\s*'Dashboard'/, 'shared nav should include Dashboard label');
  assert.match(navText, /event\.key === 'Tab'/, 'mobile sheet should trap Tab focus');
  assert.match(navText, /querySelectorAll\('a\[href\], button/, 'mobile sheet should collect tabbable elements for focus trap');
});

test('dashboard landing route defers nav ownership to shared global header', async () => {
  const dashboardIndexText = await readFile(join(dashboardRoot.pathname, 'index.tsx'), 'utf8');
  assert.doesNotMatch(dashboardIndexText, /const links = \[/, 'dashboard index should not define duplicate links array');
  assert.doesNotMatch(dashboardIndexText, /aria-label="section navigation"/, 'dashboard index should not render duplicate section nav');
  assert.doesNotMatch(dashboardIndexText, /import\s+\{\s*createFileRoute,\s*Link\s*\}/, 'dashboard index should not import Link for duplicate nav');
});

test('content routes move to root paths and legacy dashboard paths redirect', async () => {
  for (const file of files) {
    const routeName = file.replace('.tsx', '');
    const rootRouteFile = await readFile(join(rootRouteRoot.pathname, `${routeName}.tsx`), 'utf8');
    assert.match(rootRouteFile, new RegExp(`createFileRoute\\('/${routeName}'\\)`), `${routeName}.tsx should register root route /${routeName}`);

    const legacyFile = await readFile(join(dashboardRoot.pathname, file), 'utf8');
    assert.match(legacyFile, new RegExp(`createFileRoute\\('/dashboard/${routeName}'\\)`), `${routeName} legacy route missing`);
    assert.match(legacyFile, new RegExp(`redirect\\(\\{\\s*to:\\s*'/${routeName}'`), `${routeName} legacy route should redirect to root path`);
  }
});

test('mobile nav uses full-width bottom trigger and accessible sheet rows', async () => {
  const navText = await readFile(join(componentsRoot.pathname, 'navigation/global-nav.tsx'), 'utf8');
  assert.match(navText, /className="mobile-menu-trigger-full"/, 'mobile trigger should use full-width bottom control class');
  assert.match(navText, /mobile-nav-list/, 'mobile sheet should render one-row nav list');
  assert.match(navText, /aria-current=\{isActive\s*\?\s*'page'\s*:\s*undefined\}/, 'sheet nav item should mark active route');
  assert.match(navText, /const wasOpenRef = useRef\(false\)/, 'mobile sheet should track prior open state');
  assert.match(navText, /if \(wasOpenRef\.current && !open\) \{\s*triggerRef\.current\?\.focus\(\);\s*\}/, 'focus should return to trigger only after open -> close transition');

  const themeText = await readFile(new URL('../app/styles/theme.css', import.meta.url), 'utf8');
  assert.match(themeText, /\.mobile-menu-trigger-full\s*\{/, 'theme should define full-width mobile trigger class');
  assert.match(themeText, /\.mobile-sheet-enter\s*\{/, 'theme should define sheet animation class');
});

test('limits page uses table scroll wrapper and stable unique row keys', async () => {
  const limitsText = await readFile(join(rootRouteRoot.pathname, 'limits.tsx'), 'utf8');
  assert.match(limitsText, /className="table-scroll"/, 'limits table should use shared table scroll wrapper');
  assert.match(limitsText, /key=\{\[record\.provider,\s*record\.window,\s*record\.limit_name,\s*String\(record\.resets_at\)\]\.join\('\|'\)\}/, 'limits row key should be composite for duplicate providers');
  assert.match(limitsText, /const rows = payload\?\.limits\?\.length \? payload\.limits : payload\?\.records \|\| \[\]/, 'limits should fallback to records when limits missing');
});

test('dashboard surfaces project mode telemetry in overview runs and quality pages', async () => {
  const overviewText = await readFile(join(rootRouteRoot.pathname, 'overview.tsx'), 'utf8');
  assert.match(overviewText, /by_mode/, 'overview payload should include mode counts');
  assert.match(overviewText, /Top Mode/, 'overview should show top project mode tile');

  const runsText = await readFile(join(rootRouteRoot.pathname, 'runs.tsx'), 'utf8');
  assert.match(runsText, /project_mode/, 'runs payload should include project mode');
  assert.match(runsText, /<th>Mode<\/th>/, 'runs tables should show mode column');

  const qualityText = await readFile(join(rootRouteRoot.pathname, 'quality.tsx'), 'utf8');
  assert.match(qualityText, /runsByMode/, 'quality payload should include mode health rows');
  assert.match(qualityText, /Mode telemetry/, 'quality page should show mode telemetry section');
  assert.match(qualityText, /agent_runs\.project_mode/, 'quality help text should cite project mode source');
});

test('quality governance is truthful pending-only and settings exposes no automation controls', async () => {
  const settingsText = await readFile(join(rootRouteRoot.pathname, 'settings.tsx'), 'utf8');
  assert.doesNotMatch(settingsText, /QualityGovernanceCard|Hot mode ON|agent-review-auto-apply|Save governance config/, 'settings must not expose removed governor automation');
  const qualityText = await readFile(join(rootRouteRoot.pathname, 'quality.tsx'), 'utf8');
  assert.match(qualityText, /Manual contract governance/);
  assert.match(qualityText, /pending-only/);
  assert.match(qualityText, /cannot approve, apply, delegate, or validate/);
  assert.doesNotMatch(qualityText, /Hot mode active|auto-applied|automatically fixed/);
  const publicationStart = qualityText.indexOf('<h3>Rule publication</h3>');
  const publicationEnd = qualityText.indexOf('<h3>Observational evidence</h3>');
  const publicationText = qualityText.slice(publicationStart, publicationEnd);
  assert.ok(publicationStart >= 0 && publicationEnd > publicationStart, 'publication UI must remain isolated between provenance and evidence');
  assert.doesNotMatch(publicationText, /<(?:button|input|textarea)[^>]*>[^<]*(?:approve|accept|activate|deactivate|pin|editor)/i, 'publication UI must not render approval or lifecycle controls');
  assert.match(qualityText, /role="status"/); assert.match(qualityText, /aria-live="polite"/);
  assert.match(qualityText, /Governance evidence is degraded and unavailable for action/);
  assert.match(qualityText, /Governance is descriptive only and unavailable for action/);
  assert.match(qualityText, /Governance state is unavailable; no action or approval is inferred/);
  const apiText = await readFile(join(rootRouteRoot.pathname, 'api/quality/contract-governor.tsx'), 'utf8');
  assert.match(apiText, /GET:\s*\(\{ request \}\)\s*=>\s*contractGovernorApiGet\(request\)/);
  assert.match(apiText, /POST:\s*\(\{ request \}\)\s*=>\s*contractGovernorApiPost\(request\)/);
  assert.match(apiText, /PUT:\s*rejectContractGovernorWrite/);
  assert.match(apiText, /PATCH:\s*rejectContractGovernorWrite/);
  assert.match(apiText, /DELETE:\s*rejectContractGovernorWrite/);
  assert.doesNotMatch(apiText, /saveContractGovernorLocalConfig|openRuleLifecycleStore|createManualRefinementRequest|rule-learning-(?:candidate|admission)|rule-git-writer/);
});

async function loadPublicationControllers() {
  const output = await mkdtemp(join(tmpdir(), 'pidex-quality-controller-'));
  const mocks = {
    react: 'export const useRef = () => ({ current: null }); export const useState = (value) => [value, () => {}];',
    'react/jsx-runtime': 'export const jsx = () => null; export const jsxs = () => null; export const Fragment = Symbol.for("react.fragment");',
    '@tanstack/react-router': 'export const createFileRoute = () => () => ({}); export const useLocation = () => ({ search: {} });',
    recharts: 'export const Area = () => null; export const AreaChart = () => null; export const Bar = () => null; export const BarChart = () => null; export const CartesianGrid = () => null; export const Cell = () => null; export const Legend = () => null; export const Line = () => null; export const LineChart = () => null; export const Pie = () => null; export const PieChart = () => null; export const ResponsiveContainer = () => null; export const Tooltip = () => null; export const XAxis = () => null; export const YAxis = () => null;',
    '../components/ui/help-popover': 'export const HelpPopover = () => null;',
    '../components/ui/loading-indicator': 'export const LoadingIndicator = () => null;',
    '../lib/client/project-query': "export const readIncludeTestProjectsFromSearch = () => false; export const readProjectFromSearch = () => ''; export const withProjectParam = (url) => url;",
    '../lib/client/use-dashboard-query': 'export const useDashboardQuery = () => ({ data: undefined, isLoading: false, isError: false, isFetching: false, refetch: async () => ({}) });',
  };
  try {
    await build({
      entryPoints: [join(rootRouteRoot.pathname, 'quality.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      jsx: 'transform',
      jsxFactory: 'h',
      outfile: join(output, 'quality.mjs'),
      plugins: [{
        name: 'quality-controller-mocks',
        setup(plugin) {
          plugin.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'mock' } : null);
          plugin.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ contents: mocks[args.path], loader: 'js' }));
        },
      }],
    });
    return await import(`${pathToFileURL(join(output, 'quality.mjs')).href}?${Date.now()}`);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

test('quality publication controllers return closed safe fetch outcomes', async () => {
  const { loadPublicationDetail, submitRefinementRequest } = await loadPublicationControllers();
  const digest = 'a'.repeat(64);
  const publication = {
    transaction_digest: digest,
    rule_id: 'pidex-global:pidex-implementer:quality',
    tier: 'global',
    state: 'accepted_remote',
    visible_label: 'Published and verified',
    receipt_digest: 'b'.repeat(64),
    accepted_commit: 'c'.repeat(40),
    content_hash: 'd'.repeat(64),
    activation_epoch: `epoch:${'e'.repeat(24)}`,
    handoff_stage: 'status_ready',
    inspect: true,
    refinement: true,
    verified: true,
    safe_identity: true,
  };
  const get = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await loadPublicationDetail(get(200, { status: 'available', publication }), digest), {
    kind: 'ready', publication, copy: null, retry_locked: false,
  });
  for (const response of [
    get(200, { status: 'available', publication: { ...publication, visible_label: 'raw upstream error' } }),
    get(404, { error: 'raw upstream error' }),
    get(503, { error: 'raw upstream error' }),
  ]) assert.deepEqual(await loadPublicationDetail(response, digest), {
    kind: 'unavailable', publication: null, copy: 'Publication status unavailable', retry_locked: true,
  });

  const request = { action: 'request_refinement', rule_id: publication.rule_id, receipt_digest: publication.receipt_digest, request_nonce: 'test-nonce' };
  const post = (status) => async () => new Response(JSON.stringify({ error: 'raw upstream error' }), { status, headers: { 'content-type': 'application/json' } });
  for (const [status, expected] of [
    [202, { kind: 'accepted', copy: 'Refinement request accepted', invalidate_detail: true, refresh: true, retry_locked: true }],
    [400, { kind: 'stale', copy: 'Invalid or stale refinement request', invalidate_detail: true, refresh: true, retry_locked: true }],
    [409, { kind: 'stale', copy: 'Invalid or stale refinement request', invalidate_detail: true, refresh: true, retry_locked: true }],
    [403, { kind: 'operator', copy: 'Operator access required', invalidate_detail: false, refresh: false, retry_locked: true }],
    [503, { kind: 'unavailable', copy: 'Publication status unavailable', invalidate_detail: false, refresh: false, retry_locked: true }],
    [405, { kind: 'method', copy: 'Method not allowed', invalidate_detail: false, refresh: false, retry_locked: true }],
  ]) assert.deepEqual(await submitRefinementRequest(post(status), request), expected);
});

test('quality publication announcement keeps invalidating outcome visible in publication card', async () => {
  const { publicationAnnouncementForRefinementResult } = await loadPublicationControllers();
  assert.deepEqual(publicationAnnouncementForRefinementResult({ kind: 'accepted', copy: 'Refinement request accepted', invalidate_detail: true, refresh: true, retry_locked: true }), { copy: 'Refinement request accepted', kind: 'status' });
  assert.deepEqual(publicationAnnouncementForRefinementResult({ kind: 'stale', copy: 'Invalid or stale refinement request', invalidate_detail: true, refresh: true, retry_locked: true }), { copy: 'Invalid or stale refinement request', kind: 'alert' });
  assert.equal(publicationAnnouncementForRefinementResult({ kind: 'operator', copy: 'Operator access required', invalidate_detail: false, refresh: false, retry_locked: true }), null);

  const qualityText = await readFile(join(rootRouteRoot.pathname, 'quality.tsx'), 'utf8');
  const publicationStart = qualityText.indexOf('<h3>Rule publication</h3>');
  const detailStart = qualityText.indexOf('className="quality-publication-detail"', publicationStart);
  const announcement = qualityText.indexOf('publicationAnnouncement ? <p', publicationStart);
  assert.ok(announcement > publicationStart && announcement < detailStart, 'invalidating announcement must render inside publication card before detail locus');
  assert.match(qualityText, /const \[publicationAnnouncement, setPublicationAnnouncement\] = useState<\{ copy: string; kind: 'status' \| 'alert' \} \| null>\(null\)/, 'publication card owns announcement state');
  assert.match(qualityText, /const announcement = publicationAnnouncementForRefinementResult\(response\);[\s\S]*setPublicationAnnouncement\(announcement\);[\s\S]*if \(response\.invalidate_detail\) \{[\s\S]*setActivePublicationDigest\(null\);[\s\S]*setPublicationDetail\(null\)/, 'invalidating result announces before clearing detail');
  assert.match(qualityText, /role=\{publicationAnnouncement\.kind\}/, 'accepted announcement uses status and stale outcome uses alert');
  assert.doesNotMatch(qualityText.slice(announcement, detailStart), /Request refinement|Submit request|Invalid or stale refinement request/, 'announcement locus exposes no stale request controls');
});

test('quality publication component delegates fetch mapping and clears stale request state before refresh', async () => {
  const qualityText = await readFile(join(rootRouteRoot.pathname, 'quality.tsx'), 'utf8');
  assert.match(qualityText, /await loadPublicationDetail\(fetch, digest\)/, 'inspect must use pure detail controller');
  assert.match(qualityText, /await submitRefinementRequest\(fetch, \{ action: 'request_refinement'/, 'request must use pure request controller');
  assert.match(qualityText, /if \(response\.invalidate_detail\) \{[\s\S]*setActivePublicationDigest\(null\);[\s\S]*setPublicationDetail\(null\);[\s\S]*setRefinementState\('idle'\);/, 'invalidated response must clear selection, detail, and confirmation');
  assert.match(qualityText, /if \(response\.refresh\) \{[\s\S]*await governorQuery\.refetch\(\);[\s\S]*finally \{ setPublicationRetryLocked\(false\); \}/, 'refresh flag must control aggregate refresh while retry stays locked');
  assert.doesNotMatch(qualityText, /response\.status === 202 \|\| response\.status === 400/, 'component must not duplicate response-status mapping');
});

test('quality publication controllers fail closed for request extras and incomplete verification evidence', async () => {
  const { loadPublicationDetail, submitRefinementRequest } = await loadPublicationControllers();
  const digest = 'a'.repeat(64);
  const verified = {
    transaction_digest: digest,
    rule_id: 'pidex-global:pidex-implementer:quality',
    tier: 'global', state: 'accepted_remote', handoff_stage: 'status_ready',
    receipt_digest: 'b'.repeat(64), accepted_commit: 'c'.repeat(40), content_hash: 'd'.repeat(64), activation_epoch: `epoch:${'e'.repeat(24)}`,
    visible_label: 'Published and verified', inspect: true, refinement: true, private_path: '/secret/path', raw_error: 'do-not-leak',
  };
  const calls = [];
  const ready = await loadPublicationDetail(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ status: 'available', publication: verified }), { status: 200 });
  }, digest);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { url: `/api/quality/contract-governor?transaction_digest=${digest}`, init: undefined });
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.publication?.visible_label, 'Published and verified');
  assert.equal(JSON.stringify(ready).includes('do-not-leak'), false);
  assert.equal(JSON.stringify(ready).includes('/secret/path'), false);

  const fakeVerified = await loadPublicationDetail(async () => new Response(JSON.stringify({ status: 'available', publication: { ...verified, receipt_digest: null } }), { status: 200 }), digest);
  assert.deepEqual(fakeVerified, { kind: 'unavailable', publication: null, copy: 'Publication status unavailable', retry_locked: true });

  const valid = { action: 'request_refinement', rule_id: verified.rule_id, receipt_digest: verified.receipt_digest, request_nonce: 'nonce-1' };
  const posts = [];
  await submitRefinementRequest(async (url, init) => { posts.push({ url, init }); return new Response(null, { status: 202 }); }, valid);
  assert.deepEqual(posts, [{ url: '/api/quality/contract-governor', init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) } }]);

  for (const invalid of [
    { ...valid, action: 'wrong_action' }, { ...valid, rule_id: 'bad' }, { ...valid, receipt_digest: 'bad' }, { ...valid, request_nonce: 'bad nonce' }, { ...valid, private_path: '/secret/path' },
  ]) {
    let fetches = 0;
    const result = await submitRefinementRequest(async () => { fetches += 1; return new Response(null, { status: 202 }); }, invalid);
    assert.deepEqual(result, { kind: 'unavailable', copy: 'Publication status unavailable', invalidate_detail: false, refresh: false, retry_locked: true });
    assert.equal(fetches, 0);
  }
});

test('pipelines route guards object-valued fields before rendering cells', async () => {
  const pipelinesText = await readFile(join(rootRouteRoot.pathname, 'pipelines.tsx'), 'utf8');
  assert.match(pipelinesText, /function formatText\(value: unknown\): string/, 'pipelines should normalize unknown text values to render-safe strings');
  assert.match(pipelinesText, /if \(value == null\) return '—';/, 'text formatter should handle nullish values');
  assert.match(pipelinesText, /if \(typeof value === 'object'\) return '—';/, 'text formatter should reject object values');
  assert.match(pipelinesText, /withProjectParam\('\/api\/pipelines', project, includeTestProjects\)/, 'pipelines should avoid coercing router search object into endpoint string');
  assert.match(pipelinesText, /<td>\{formatText\(row\.project\)\}<\/td>/, 'project cell should use safe text formatter');
  assert.match(pipelinesText, /<td>\{formatText\(row\.plan_key\)\}<\/td>/, 'plan key cell should use safe text formatter');
  assert.match(pipelinesText, /key=\{`\$\{formatText\(row\.completed_at\)\}-\$\{formatText\(row\.project\)\}-\$\{formatText\(row\.plan_key\)\}-\$\{index\}`\}/, 'row key should avoid direct object coercion');
});
