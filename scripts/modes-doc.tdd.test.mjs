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

const supportingFeatureRows = [
  'Project context / grilling',
  'Quality reports / PDQ',
  'Quality governance / rule learning',
  'Wiki hygiene',
  'Project session memory',
  'Dashboard views',
  'Provider limits / profiles',
  'History / metrics / recent projects',
  'Host safety / project boundary / Git hooks',
  'Package-manager helpers',
  'Browser-smoke runtime maintenance',
  'Install / doctor / release readiness',
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

test('project mode docs include supporting feature mode behavior rows', () => {
  assert.match(modesDoc, /## Supporting feature mode behavior/);
  for (const row of supportingFeatureRows) {
    assert.equal(modesDoc.includes(row), true, row);
  }
  assert.match(modesDoc, /host project directory regardless of mode/);
  assert.match(modesDoc, /mode\/archive metrics should be expanded/);
});

test('project mode docs capture intentional mode-specific differences', () => {
  assert.match(modesDoc, /Project Pipeline managed preview is mode-native/);
  assert.match(modesDoc, /Project Pipeline browser-smoke automation is mode-native today/);
  assert.match(modesDoc, /Hardened-pipeline is temporary protection/);
  assert.match(modesDoc, /Host-direct should remain the least-boundary, lowest-overhead mode/);
  assert.match(modesDoc, /Project Pipeline source is intentionally not mirrored back to the host automatically/);
  assert.match(modesDoc, /Project-specific PIDEX context, wiki, and memory files live in the host project directory/);
  assert.match(modesDoc, /live prompt injection is a module need, not a baseline requirement/);
  assert.match(modesDoc, /parallel secondary lanes in every mode/);
  assert.match(modesDoc, /must state mode impact explicitly/);
  assert.match(modesDoc, /quality governance, dashboard views, provider profiles, project context/);
});

test('public docs link the project mode matrix', () => {
  assert.match(readme, /\[Project modes\]\(readme\/modes\.md\)/);
  assert.match(readme, /host-direct.*hardened-pipeline.*project-pipeline/s);
  assert.match(projectPipeline, /\[Project modes\]\(modes\.md\)/);
});
