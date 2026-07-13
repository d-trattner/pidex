#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8');
assert.match(source, /async function runRpAgent\([\s\S]*?effort\?: string;/);
assert.match(source, /if \(params\.effort\) args\.push\("--thinking", params\.effort\)/);
assert.match(source, /runRpAgent\(\{[\s\S]*?effort: selectedEffort,[\s\S]*?tools: explicitTools/);
assert.match(source, /modelRequested: model,\s*effort: params\.effort,/);
console.log('pidex Pi effort forwarding tests passed');
