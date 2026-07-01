import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (full.endsWith('.mjs')) out.push(full);
  }
  return out;
}

test('browser-smoke module does not import Project Pipeline internals', () => {
  const root = path.resolve('modules/pidex/browser-smoke');
  const forbiddenImport = /from\s+['"][^'"]*project-pipeline[^'"]*['"]|import\s*\([^)]*project-pipeline/;
  const forbiddenArchiveLayout = `state/${'project-archives'}`;
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    assert.equal(forbiddenImport.test(text), false, `${file} must not import Project Pipeline internals`);
    assert.equal(text.includes(forbiddenArchiveLayout), false, `${file} must not know Project Pipeline archive layout`);
  }
});
