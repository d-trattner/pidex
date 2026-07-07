import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modesDoc = readFileSync('readme/modes.md', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const projectPipeline = readFileSync('readme/project-pipeline.md', 'utf8');

const modes = ['host-direct', 'hardened-pipeline', 'project-pipeline'];
const capabilityRows = [
  'Saved per-project mode',
  '`/pd` from home/new project interview',
  'Specialist phase chain',
  'Source canonical location',
  'Artifact location',
  'Credential model',
  'Delegate/provider routing',
  'Parallel secondary lanes',
  'Module capability discovery',
  'Live module-rule prompt injection',
  'Managed preview lifecycle',
  'Browser-smoke install/preflight',
  'Browser-smoke automatic request/bridge/verdict loop',
  'Windows evidence',
];

test('project mode docs define all supported per-project modes', () => {
  for (const mode of modes) {
    assert.equal(modesDoc.includes(`\`${mode}\``), true, mode);
  }
  assert.match(modesDoc, /Parity means differences are intentional, documented, and tested/);
  assert.match(modesDoc, /does \*\*not\*\* mean every feature must run in every mode/);
});

test('project mode docs include required capability matrix rows', () => {
  for (const row of capabilityRows) {
    assert.equal(modesDoc.includes(row), true, row);
  }
});

test('project mode docs capture intentional mode-specific differences', () => {
  assert.match(modesDoc, /Project Pipeline managed preview is mode-native/);
  assert.match(modesDoc, /Project Pipeline browser-smoke automation is mode-native today/);
  assert.match(modesDoc, /Hardened-pipeline is temporary protection/);
  assert.match(modesDoc, /Project Pipeline source is not mirrored back to the host automatically/);
  assert.match(modesDoc, /must state mode impact explicitly/);
});

test('public docs link the project mode matrix', () => {
  assert.match(readme, /\[Project modes\]\(readme\/modes\.md\)/);
  assert.match(readme, /host-direct.*hardened-pipeline.*project-pipeline/s);
  assert.match(projectPipeline, /\[Project modes\]\(modes\.md\)/);
});
