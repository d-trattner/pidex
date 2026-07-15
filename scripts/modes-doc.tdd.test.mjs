import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modesDoc = readFileSync('readme/modes.md', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const projectPipeline = readFileSync('readme/project-pipeline.md', 'utf8');
const parallelAgents = readFileSync('readme/parallel-agents.md', 'utf8');
const browserSmoke = readFileSync('modules/pidex/browser-smoke/README.md', 'utf8');
const modulesDoc = readFileSync('readme/modules.md', 'utf8');
const pidexSkill = readFileSync('skills/pidex/SKILL.md', 'utf8');
const conversationRoadmapRule = readFileSync('rules/orchestrator/conversation-to-roadmap-promotion.md', 'utf8');
const noDirectImplementationRule = readFileSync('rules/orchestrator/no-direct-implementation.md', 'utf8');

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
  'Module-rule prompt use',
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
  assert.match(modesDoc, /saved\/observed `project_mode`/);
  assert.match(modesDoc, /parallel-lane telemetry/);
});

test('project mode docs capture intentional mode-specific differences', () => {
  assert.match(modesDoc, /Project Pipeline managed preview is mode-native/);
  assert.match(modesDoc, /Project Pipeline browser-smoke automation is mode-native today/);
  assert.match(modesDoc, /Host-direct and hardened-pipeline keep only generic\/manual PIDEX-local browser-smoke capability/);
  assert.match(modesDoc, /Hardened-pipeline is temporary protection/);
  assert.match(modesDoc, /Host-direct should remain the least-boundary, lowest-overhead mode/);
  assert.match(modesDoc, /Project Pipeline source is intentionally not mirrored back to the host automatically/);
  assert.match(modesDoc, /Project-specific PIDEX context, wiki, and memory files live in the host project directory/);
  assert.match(modesDoc, /Module-scoped rules are part of the PIDEX-wide module system, not Project Pipeline-only/);
  assert.match(modesDoc, /true concurrency and richer dashboard\/PDQ lane visualization/);
  assert.match(modesDoc, /must state mode impact explicitly/);
  assert.match(modesDoc, /modules, module-scoped rules, quality reports/);
});

test('public docs link the project mode matrix', () => {
  assert.match(readme, /\[Project modes\]\(readme\/modes\.md\)/);
  assert.match(readme, /host-direct.*hardened-pipeline.*project-pipeline/s);
  assert.match(projectPipeline, /\[Project modes\]\(modes\.md\)/);
});

test('module docs preserve PIDEX-wide module-rule scope', () => {
  assert.match(modesDoc, /PIDEX-wide capability; host-direct may render\/include matched module rules/);
  assert.match(modesDoc, /PIDEX-wide capability; hardened-pipeline may render\/include matched module rules/);
  assert.match(modesDoc, /Current first automatic consumer: Project Pipeline/);
  assert.match(modulesDoc, /PIDEX-wide module-rule eligibility/);
  assert.match(modulesDoc, /This does not make module-scoped rules Project Pipeline-only/);
  assert.match(modulesDoc, /integration gap, not a module-scope guard/);
});

test('browser-smoke docs preserve mode boundary decision', () => {
  assert.match(modesDoc, /Intentionally not automatic; host-direct preview\/server ownership stays user\/project-owned/);
  assert.match(modesDoc, /Intentionally not automatic; Docker is a temporary programming harness, not the preview owner/);
  assert.match(browserSmoke, /Automatic browser-smoke request discovery/);
  assert.match(browserSmoke, /Project Pipeline-only today/);
  assert.match(browserSmoke, /Host-direct and hardened-pipeline remain manual\/operator-owned/);
});

test('parallel agents docs preserve all-mode boundary contract', () => {
  assert.match(parallelAgents, /## Mode contract/);
  for (const mode of modes) assert.equal(parallelAgents.includes(`\`${mode}\``), true, mode);
  assert.match(parallelAgents, /Disabled\/no eligible lanes must add no meaningful overhead/);
  assert.match(parallelAgents, /Host source remains canonical/);
  assert.match(parallelAgents, /Source remains container-canonical/);
  assert.match(parallelAgents, /MVP may execute secondary lanes sequentially/);
  assert.match(parallelAgents, /project_mode.*parallel_lane_id.*parallel_trigger.*parallel_role/s);
});

test('orchestrator promotes multi-increment conversations through pidex-roadmap before planning', () => {
  const promotionStep = pidexSkill.indexOf('### Step 7.5 — Conversation-to-roadmap promotion');
  const classificationStep = pidexSkill.indexOf('### Step 8 — Task classification');
  assert.notEqual(promotionStep, -1);
  assert.equal(promotionStep < classificationStep, true);
  assert.match(pidexSkill, /conversation-to-roadmap-promotion\.md/);
  assert.match(conversationRoadmapRule, /two or more confirmed or credible future delivery increments/);
  assert.match(conversationRoadmapRule, /A single small follow-up does not trigger this rule/);
  assert.match(conversationRoadmapRule, /reconcile semantically equivalent entries before proposing changes/);
  assert.match(conversationRoadmapRule, /continue without duplication/);
  assert.match(conversationRoadmapRule, /before task classification, `pidex-architect`, `pidex-planner`, or any implementation route/);
  assert.match(conversationRoadmapRule, /`pidex-roadmap` is the sole roadmap-writing authority/);
  assert.match(conversationRoadmapRule, /must never create, edit, rewrite, or append to the canonical roadmap/);
  assert.match(conversationRoadmapRule, /must not produce a substitute roadmap draft/);
  assert.match(conversationRoadmapRule, /Present the `pidex-roadmap`-produced update to the user for review/);
  assert.match(conversationRoadmapRule, /must not take over roadmap writing as fallback/);
  assert.match(conversationRoadmapRule, /standalone urgent task may proceed when it has no dependency impact/);
  assert.match(noDirectImplementationRule, /all canonical roadmap mutations belong to `pidex-roadmap`/);
  assert.match(noDirectImplementationRule, /substitute roadmap draft/);
});

test('orchestrator enforces proportional minimal runs and a cumulative loop breaker', () => {
  assert.match(pidexSkill, /Proportional minimal-run intent \(mandatory\)/);
  assert.match(pidexSkill, /minimal v1.*MVP.*small.*simple.*cheap.*quick.*single-lane/s);
  assert.match(pidexSkill, /one authoritative primary critic and one authoritative primary code reviewer/);
  assert.match(pidexSkill, /new threat tier, acceptance criterion, proof matrix, instrumentation subsystem, or evidence contract is \*\*scope expansion\*\*/);
  assert.match(pidexSkill, /second rejection at the same gate/);
  assert.match(pidexSkill, /second residual re-slice at the same gate/);
  assert.match(pidexSkill, /simplify\/retain the approved contract.*accept and document residual risk.*continue hardened remediation/s);
  assert.match(pidexSkill, /circuit breaker overrides automatic `route_to: orchestrator`/);
  assert.match(parallelAgents, /Explicit proportional language.*minimal v1.*MVP.*single-lane.*suppresses these optional generic secondary lanes/s);
});
