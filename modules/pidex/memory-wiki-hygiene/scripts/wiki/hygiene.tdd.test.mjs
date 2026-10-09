#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const script=path.join(root,'scripts/wiki/hygiene.mjs');
const tmp=mkdtempSync(path.join(os.tmpdir(),'pidex-wiki-hygiene-'));
try{mkdirSync(path.join(tmp,'wiki'),{recursive:true});writeFileSync(path.join(tmp,'wiki','index.md'),'# Index\n[missing](nope.md)\n','utf8');writeFileSync(path.join(tmp,'wiki','log.md'),'# Log\n','utf8');const cp=spawnSync(process.execPath,[script,'audit','--project',tmp,'--json-only'],{encoding:'utf8'});assert.equal(cp.status,0,cp.stderr||cp.stdout);const line=cp.stdout.split(/\r?\n/).find(l=>l.startsWith('PIDEX_WIKI_HYGIENE_RESULT='));assert.ok(line);const data=JSON.parse(line.slice('PIDEX_WIKI_HYGIENE_RESULT='.length));assert.equal(data.high,1);assert.ok(existsSync(data.report_json));const cad=spawnSync(process.execPath,[script,'cadence','--project',tmp,'--plan','plan-001','--pipeline-id','p','--terminal-event','pipeline_completed'],{encoding:'utf8'});assert.equal(cad.status,0,cad.stderr||cad.stdout);assert.ok(existsSync(path.join(tmp,'pidex','state','wiki-hygiene.json')))}finally{rmSync(tmp,{recursive:true,force:true})}
// Exercise the real CLI. The narrow adapter models both existence and canonical
// spelling for one existing alias; it is not a general Windows filesystem mock.
const fixtures = mkdtempSync(path.join(os.tmpdir(), 'pidex-wiki-identity-'));
const outcomes = [];
function projectFixture(name, links) {
  const project = path.join(fixtures, name);
  mkdirSync(path.join(project, 'wiki', 'concepts'), { recursive: true });
  writeFileSync(path.join(project, 'wiki', 'index.md'), `# Index\n${links}\n`);
  writeFileSync(path.join(project, 'wiki', 'log.md'), '# Log\n');
  writeFileSync(path.join(project, 'wiki', 'concepts', 'thing.md'), '# Thing\n');
  return project;
}
function auditFixture(project, imports = []) {
  const result = spawnSync(process.execPath, [...imports, script, 'audit', '--project', project, '--json-only'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const marker = result.stdout.split(/\r?\n/).find((line) => line.startsWith('PIDEX_WIKI_HYGIENE_RESULT='));
  assert.ok(marker, result.stdout);
  return JSON.parse(readFileSync(JSON.parse(marker.slice('PIDEX_WIKI_HYGIENE_RESULT='.length)).report_json, 'utf8'));
}
function assertLinked(report, target, incoming = 1) {
  const page = report.inventory.find((entry) => entry.path === target);
  assert.ok(page, target);
  assert.equal(page.linked_from_count, incoming, `canonical incoming links for ${target}`);
  assert.equal(report.findings.some((finding) => finding.category === 'orphan' && finding.file === target), false);
  assert.ok(report.graph_conventions.top_hubs.some((hub) => hub.path === target.slice(5) && hub.inbound === incoming));
}
try {
  for (const [name, link] of [['wiki', '[[concepts/Thing]]'], ['markdown', '[Thing](concepts/Thing.md)']]) {
    const project = projectFixture(name, link);
    const requested = path.join(project, 'wiki', 'concepts', 'Thing.md');
    const actual = path.join(project, 'wiki', 'concepts', 'thing.md');
    const witness = path.join(project, 'alias-observation.json');
    const preload = path.join(project, 'alias-observer.mjs');
    writeFileSync(preload, `import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const requested = ${JSON.stringify(requested)}, actual = ${JSON.stringify(actual)};
const seen = { exists: 0, canonical: 0 };
const originalExists = fs.existsSync, originalRealpath = fs.realpathSync;
const alias = (file) => typeof file === 'string' && path.resolve(file) === requested;
fs.existsSync = function(file) { if (alias(file)) { seen.exists++; return originalExists(actual); } return originalExists(file); };
fs.realpathSync = function(file, ...args) { if (alias(file)) { seen.canonical++; return originalRealpath(actual, ...args); } return originalRealpath(file, ...args); };
fs.realpathSync.native = function(file, ...args) { if (alias(file)) { seen.canonical++; return originalRealpath.native(actual, ...args); } return originalRealpath.native(file, ...args); };
syncBuiltinESMExports();
process.once('exit', () => fs.writeFileSync(${JSON.stringify(witness)}, JSON.stringify(seen)));
`);
    const report = auditFixture(project, ['--import', preload]);
    assertLinked(report, 'wiki/concepts/thing.md');
    assert.equal(report.graph_conventions.top_hubs.some((hub) => hub.path === 'concepts/Thing.md'), false);
    assert.equal(report.inventory.find((entry) => entry.path === 'wiki/index.md').outgoing_links_count, 1);
    assert.equal(report.findings.some((finding) => ['broken-link', 'broken-wikilink', 'ambiguous-link'].includes(finding.category)), false);
    const seen = JSON.parse(readFileSync(witness, 'utf8'));
    assert.ok(seen.exists > 0 && seen.canonical > 0, 'alias lookup and actual canonical resolver both exercised');
    outcomes.push(`${name}-case-alias`);
  }
  const exact = projectFixture('exact', '[[concepts/thing]]\n[Thing](concepts/thing.md)');
  assertLinked(auditFixture(exact), 'wiki/concepts/thing.md');
  outcomes.push('exact-spelling');

  const distinct = projectFixture('distinct', '[[concepts/thing]]\n[Upper](concepts/Thing.md)');
  const upper = path.join(distinct, 'wiki', 'concepts', 'Thing.md');
  let distinctNames = true;
  try { writeFileSync(upper, '# Separate upper-case page\n', { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; distinctNames = false; }
  const distinctReport = auditFixture(distinct);
  assertLinked(distinctReport, 'wiki/concepts/thing.md');
  if (distinctNames) {
    assert.ok(readdirSync(path.dirname(upper)).includes('Thing.md'));
    assertLinked(distinctReport, 'wiki/concepts/Thing.md');
    assert.equal(distinctReport.inventory.find((entry) => entry.path === 'wiki/index.md').outgoing_links_count, 2);
    outcomes.push('distinct-case-sensitive-files');
  } else {
    assert.equal(distinctReport.inventory.filter((entry) => entry.path.startsWith('wiki/concepts/')).length, 1);
    assert.equal(distinctReport.inventory.find((entry) => entry.path === 'wiki/index.md').outgoing_links_count, 1);
    outcomes.push('same-case-insensitive-file');
  }

  const boundary = projectFixture('boundary', '[[../wiki-sibling/outside-only]]\n[External](../wiki-sibling/outside-only.md)\n[[missing-wiki]]\n[Missing](missing.md)');
  mkdirSync(path.join(boundary, 'wiki-sibling'));
  writeFileSync(path.join(boundary, 'wiki-sibling', 'outside-only.md'), '# External\n');
  const boundaryReport = auditFixture(boundary);
  assert.deepEqual(boundaryReport.findings.filter((finding) => finding.category === 'broken-wikilink').map((finding) => finding.evidence).sort(), ['../wiki-sibling/outside-only', 'missing-wiki']);
  assert.deepEqual(boundaryReport.findings.filter((finding) => finding.category === 'broken-link').map((finding) => finding.evidence), ['missing.md']);
  assert.equal(boundaryReport.inventory.some((entry) => entry.path.includes('wiki-sibling')), false);
  outcomes.push('missing-and-sibling-boundary');
  let separateWiki = true;
  try { mkdirSync(path.join(boundary, 'Wiki')); }
  catch (error) { if (error.code !== 'EEXIST') throw error; separateWiki = false; }
  if (separateWiki) {
    writeFileSync(path.join(boundary, 'Wiki', 'outside-case-only.md'), '# Outside canonical wiki\n');
    writeFileSync(path.join(boundary, 'wiki', 'index.md'), '# Index\n[[../Wiki/outside-case-only]]\n');
    const report = auditFixture(boundary);
    assert.ok(report.findings.some((finding) => finding.category === 'broken-wikilink' && finding.evidence === '../Wiki/outside-case-only'));
    outcomes.push('distinct-case-directory-boundary');
  } else outcomes.push('case-insensitive-wiki-directory');

  const rootAlias = path.join(fixtures, 'root-alias');
  let aliasSupported = true;
  try { symlinkSync(exact, rootAlias, 'junction'); }
  catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    aliasSupported = false;
    outcomes.push(`root-alias-filesystem-unavailable:${error.code}`);
  }
  if (aliasSupported) {
    const report = auditFixture(rootAlias);
    assertLinked(report, 'wiki/concepts/thing.md');
    assert.deepEqual(report.graph_conventions, auditFixture(exact).graph_conventions);
    outcomes.push('real-root-alias');
  }
  console.log('wiki identity regressions: ' + outcomes.join(', '));
} finally { rmSync(fixtures, { recursive: true, force: true }); }
console.log('wiki hygiene.mjs tests passed');
