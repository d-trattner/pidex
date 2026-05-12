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
  assert.match(navText, /label:\s*'Overview'/, 'shared nav should include Overview label');
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
