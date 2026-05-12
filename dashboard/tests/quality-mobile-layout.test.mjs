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

console.log('quality mobile layout assertions passed');
