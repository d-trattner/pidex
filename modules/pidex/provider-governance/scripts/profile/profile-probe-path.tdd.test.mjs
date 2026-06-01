#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

for (const name of ['current.sh', 'recommend.sh', 'use.sh']) {
  test(`${name} uses module probe implementation path`, () => {
    const text = readFileSync(path.join(root, 'modules/pidex/provider-governance/scripts/profile', name), 'utf8');
    assert.match(text, /modules\/pidex\/provider-governance\/scripts\/provider-limits\/probe\.mjs/);
    assert.doesNotMatch(text, /PROBE="\$ROOT\/scripts\/provider-limits\/probe\.mjs"/);
  });
}
