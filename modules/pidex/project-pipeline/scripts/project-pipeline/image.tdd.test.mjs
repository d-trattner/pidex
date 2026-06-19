import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildImage, buildImageArgs, imageStatus, inspectImageArgs } from './image.mjs';

test('buildImageArgs points at project-pipeline Dockerfile and default tag', () => {
  const args = buildImageArgs({ moduleRoot: '/tmp/project-pipeline', tag: 'pidex/test:local' });
  assert.deepEqual(args, ['build', '-t', 'pidex/test:local', '-f', path.join('/tmp/project-pipeline', 'Dockerfile'), '/tmp/project-pipeline']);
});

test('imageStatus reports missing or present from docker inspect', () => {
  const missing = imageStatus({ tag: 'x', runner: () => ({ status: 1, stdout: '', stderr: 'not found' }) });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 'missing');
  const present = imageStatus({ tag: 'x', runner: () => ({ status: 0, stdout: '"sha256:abc"\n', stderr: '' }) });
  assert.equal(present.ok, true);
  assert.equal(present.image_id, 'sha256:abc');
});

test('Dockerfile installs Pi CLI without lifecycle scripts or secrets', () => {
  const dockerfile = readFileSync(path.resolve('modules/pidex/project-pipeline/Dockerfile'), 'utf8');
  assert.match(dockerfile, /npm install -g --ignore-scripts "@earendil-works\/pi-coding-agent@\$\{PI_CODING_AGENT_VERSION\}"/);
  assert.match(dockerfile, /pi --version/);
  assert.doesNotMatch(dockerfile, /API_KEY|TOKEN|SECRET/);
});

test('buildImage runs build then inspect', () => {
  const calls = [];
  const result = buildImage({ tag: 'pidex/test:local', moduleRoot: '/tmp/project-pipeline', runner: (args) => {
    calls.push(args);
    if (args[0] === 'build') return { status: 0, stdout: 'built', stderr: '' };
    return { status: 0, stdout: '"sha256:def"', stderr: '' };
  } });
  assert.equal(result.ok, true);
  assert.equal(result.image_id, 'sha256:def');
  assert.equal(calls[0][0], 'build');
  assert.deepEqual(calls[1], inspectImageArgs('pidex/test:local'));
});
