import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const qualityRoute = readFileSync(new URL('../routes/quality.tsx', import.meta.url), 'utf8');
const themeCss = readFileSync(new URL('../app/styles/theme.css', import.meta.url), 'utf8');

assert.match(qualityRoute, /className="grid quality-metrics-grid"/, 'cards section must use dedicated mobile metrics grid class');
assert.match(qualityRoute, /className="glass-card glass quality-metric-card"/g, 'metric cards must use dedicated class for mobile full-row behavior');
assert.match(themeCss, /\.quality-metrics-grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/, 'mobile metrics grid must be one column');
assert.match(themeCss, /\.glass-card\.quality-card\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1;/, 'mobile quality chart cards must override base glass-card span');
assert.match(themeCss, /\.glass-card\.quality-metric-card\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1;/, 'mobile quality metric cards must override base glass-card span');
assert.match(themeCss, /@media \(min-width:\s*900px\)[\s\S]*\.glass-card\.quality-card\s*\{[\s\S]*grid-column:\s*span\s*4;/, 'desktop quality chart cards must restore 4-column span');
assert.match(themeCss, /@media \(min-width:\s*900px\)[\s\S]*\.glass-card\.quality-metric-card\s*\{[\s\S]*grid-column:\s*span\s*3;/, 'desktop quality metric cards must restore 3-column span');
assert.match(themeCss, /@media \(min-width:\s*900px\)[\s\S]*\.quality-metrics-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\);/, 'desktop metrics grid must preserve 12-column layout');

const glassCardIndex = themeCss.indexOf('.glass-card {\n  grid-column: span 4;');
const mobileQualityOverrideIndex = themeCss.indexOf('.glass-card.quality-card {\n  grid-column: 1 / -1;');
const mobileMetricOverrideIndex = themeCss.indexOf('.glass-card.quality-metric-card {\n  grid-column: 1 / -1;');

assert.ok(glassCardIndex >= 0, 'base glass-card span rule must exist');
assert.ok(mobileQualityOverrideIndex > glassCardIndex, 'quality-card mobile override must appear after base glass-card rule');
assert.ok(mobileMetricOverrideIndex > glassCardIndex, 'quality-metric-card mobile override must appear after base glass-card rule');

assert.match(qualityRoute, /body\s*\{\s*background:\s*#03060d;\s*\}/, 'publication route must provide nontransparent themed body fallback');
assert.match(qualityRoute, /data-testid="quality-publication-article"/, 'publication article must have stable browser-audit selector');
for (const className of ['quality-publication-scroll', 'quality-publication-detail', 'quality-publication-request']) {
  assert.match(qualityRoute, new RegExp(`className="[^"]*${className}`), `publication audit selector ${className} must remain stable`);
}

// ---- Plan048 Slice3B/4: lifecycle card mobile/responsive contract (RED) ----
assert.match(qualityRoute, /data-testid="quality-lifecycle-article"/, 'lifecycle article must have stable browser-audit selector');
for (const className of ['quality-lifecycle-scroll', 'quality-lifecycle-detail', 'quality-lifecycle-request']) assert.match(qualityRoute, new RegExp(`className="[^"]*${className}`), `lifecycle audit selector ${className} must remain stable`);
assert.match(qualityRoute, /\.quality-lifecycle-control\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/, 'lifecycle controls must keep 44px minimum touch geometry');
assert.match(qualityRoute, /\.quality-lifecycle-control:focus-visible,\s*\.quality-lifecycle-scroll:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\);/, 'lifecycle controls/scroller must keep visible accent focus outline');
assert.match(qualityRoute, /\.quality-lifecycle-digest\s*\{[^}]*overflow-wrap:\s*anywhere;/, 'long lifecycle identities must wrap anywhere at mobile width');
assert.doesNotMatch(qualityRoute, /overflow-x:\s*hidden/, 'page overflow must not be masked with overflow-x hidden');

console.log('quality mobile layout assertions passed');
