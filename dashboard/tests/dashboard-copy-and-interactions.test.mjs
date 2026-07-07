import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

test('pipelines route guards object-valued fields before rendering cells', async () => {
  const pipelinesText = await readFile(join(rootRouteRoot.pathname, 'pipelines.tsx'), 'utf8');
  assert.match(pipelinesText, /function formatText\(value: unknown\): string/, 'pipelines should normalize unknown text values to render-safe strings');
  assert.match(pipelinesText, /if \(value == null\) return '—';/, 'text formatter should handle nullish values');
  assert.match(pipelinesText, /if \(typeof value === 'object'\) return '—';/, 'text formatter should reject object values');
  assert.match(pipelinesText, /withProjectParam\('\/api\/pipelines', project\)/, 'pipelines should avoid coercing router search object into endpoint string');
  assert.match(pipelinesText, /<td>\{formatText\(row\.project\)\}<\/td>/, 'project cell should use safe text formatter');
  assert.match(pipelinesText, /<td>\{formatText\(row\.plan_key\)\}<\/td>/, 'plan key cell should use safe text formatter');
  assert.match(pipelinesText, /key=\{`\$\{formatText\(row\.completed_at\)\}-\$\{formatText\(row\.project\)\}-\$\{formatText\(row\.plan_key\)\}-\$\{index\}`\}/, 'row key should avoid direct object coercion');
});
