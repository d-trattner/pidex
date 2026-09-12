import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { recordPipelineEvent, resolvePlanReviewAuthority } from '../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs';

// Actual public tool/runner. Only a credential-free dummy executable, never a provider.
test('explicit host review uses recorded authority when ambient pipeline context is absent', { skip: process.platform !== 'linux', timeout: 90000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-review-context-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = path.join(root, 'runtime'), stateDir = path.join(root, 'state'), home = path.join(root, 'home'), bin = path.join(root, 'bin');
  for (const dir of [stateDir, home, bin, path.join(runtime, 'agents'), path.join(runtime, 'config'), path.join(runtime, 'scripts')]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(runtime, 'package.json'), '{"name":"pidex","version":"0.0.0"}');
  fs.writeFileSync(path.join(runtime, 'config/agents.json'), JSON.stringify({ defaults: { provider: 'pi', model: 'openai-codex/gpt-5.6-terra', timeoutSeconds: 5 }, agents: {} }));
  fs.writeFileSync(path.join(runtime, 'agents/pidex-critic.md'), '---\nname: pidex-critic\n---\nSynthetic review only.');
  fs.writeFileSync(path.join(bin, 'package.json'), '{"type":"commonjs"}');
  for (const name of ['codex', 'claude', 'gemini']) fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 97\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'pi'), `#!/usr/bin/env node
const fs=require('node:fs');fs.appendFileSync('starts','1\\n');const artifact='agents.output/critiques/001.md';fs.mkdirSync('agents.output/critiques',{recursive:true});const payload={schemaVersion:'pidex-review-outcome-v1',verdict:'APPROVED',contractDisposition:'in_contract',findings:[]};fs.writeFileSync(artifact,'# Synthetic fixture\\n'+String.fromCharCode(96).repeat(3)+'pidex-review-outcome-v1\\n'+JSON.stringify(payload)+'\\n'+String.fromCharCode(96).repeat(3));console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'<!-- ROUTING\\nverdict: APPROVED\\nroute_to: pidex-implementer\\ncontext_file: '+artifact+'\\n-->'}]}}));
`, { mode: 0o700 });
  const env = { HOME: home, PATH: bin + path.delimiter + process.env.PATH, PIDEX_ROOT: runtime, PIDEX_HOME_ROOT: runtime, PIDEX_STATE_DIR: stateDir, RUNNING_PI_STATE_DIR: stateDir, NODE_OPTIONS: '' };
  const url = new URL('../../extensions/pidex/index.ts', import.meta.url).href;
  for (const mode of ['absent', 'matching', 'conflicting', 'legacy-conflicting', 'lifecycle-conflicting', 'missing-authority', 'corrupt-authority', 'malformed-history', 'malformed', 'implicit']) await t.test(mode, () => {
    const project = path.join(root, mode); fs.mkdirSync(project);
    const stateDir = path.join(project, 'state'); fs.mkdirSync(stateDir);
    const pipelineId = 'producer-opening-' + mode;
    const context = { stateDir, project, planId: 'plan-001' };
    if (mode !== 'missing-authority') recordPipelineEvent({ ...context, pipelineId, plan: 'plan-001', event: 'pipeline_started' });
    let corruptStream;
    if (mode === 'corrupt-authority' || mode === 'malformed-history') {
      const name = mode === 'corrupt-authority' ? 'plan-001.current' : pipelineId + '.jsonl';
      corruptStream = path.join(stateDir, fs.readdirSync(stateDir, { recursive: true }).find(file => path.basename(file) === name));
      if (mode === 'corrupt-authority') fs.writeFileSync(corruptStream, '../invalid-pointer');
      else fs.appendFileSync(corruptStream, '{invalid-json}\n');
    }
    const corruptBefore = corruptStream && fs.readFileSync(corruptStream, 'utf8');
    // runFamilyId is deliberately NOT pipelineId. Never infer stream authority from it.
    const identity = { runFamilyId: 'separate-family', planId: 'plan-001', reviewGate: 'critic', reviewMode: 'initial', attemptId: 'attempt-fixture' };
    const params = { agent: 'pidex-critic', task: 'Plan 001 initial critic', ...(mode === 'implicit' ? {} : { reviewIdentity: mode === 'malformed' ? { planId: 'plan-001' } : identity }) };
    const invoke = mode === 'lifecycle-conflicting'
      ? `executeHostAgentBoundary(normalizePublicReviewIdentity(${JSON.stringify(params)}),{agentCwd:${JSON.stringify(project)},reviewLifecycle:{stateDir:${JSON.stringify(stateDir)},pipelineId:'wrong-opening'},resolveSandboxState:()=>({enabled:false})})`
      : `tools.get('pidex_agent').execute('fixture',${JSON.stringify(params)},undefined,undefined,{cwd:${JSON.stringify(project)},hasUI:false})`;
    const script = `import extension,{executeHostAgentBoundary,normalizePublicReviewIdentity} from ${JSON.stringify(url)};const tools=new Map();extension({on(){},registerCommand(){},registerTool:t=>tools.set(t.name,t),getCommands:()=>[]});try{console.log(JSON.stringify(await ${invoke}));}catch(e){console.error(e.message);process.exitCode=1;}`;
    const runEnv = { ...env, PIDEX_STATE_DIR: stateDir, RUNNING_PI_STATE_DIR: stateDir, ...(mode === 'matching' ? { PIDEX_PIPELINE_ID: pipelineId } : mode === 'conflicting' ? { PIDEX_PIPELINE_ID: 'wrong-opening' } : mode === 'legacy-conflicting' ? { RUNNING_PI_PIPELINE_ID: 'wrong-opening' } : {}) };
    const run = () => spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: project, env: runEnv, encoding: 'utf8', timeout: 15000 });
    const result = run(); const positive = ['absent', 'matching', 'implicit'].includes(mode);
    assert.equal(result.status, positive ? 0 : 1, result.stderr);
    assert.equal(fs.existsSync(path.join(project, 'starts')), positive);
    if (!positive) {
      // Existing malformed-JSON diagnostics are not normalized here; refusal/no mutation is required.
      if (mode !== 'malformed-history') assert.match(result.stderr, mode.includes('conflicting') ? /REVIEW_EXECUTION_MISMATCH/ : mode === 'malformed' ? /REVIEW_IDENTITY_INVALID/ : mode === 'corrupt-authority' ? /REVIEW_HISTORY_INVALID/ : /REVIEW_AUTHORITY_NOT_FOUND/);
      if (corruptStream) assert.equal(fs.readFileSync(corruptStream, 'utf8'), corruptBefore);
      else if (mode !== 'missing-authority') assert(!resolvePlanReviewAuthority(context).rows.some(r => r.event_type === 'start_reserved'));
      return;
    }
    let rows = resolvePlanReviewAuthority(context).rows;
    assert.equal(rows.filter(r => r.event_type === 'start_reserved').length, 1);
    assert.equal(rows.findLast(r => r.event_type === 'review_outcome').metadata.outcome, 'APPROVED');
    if (mode !== 'implicit') {
      const before = JSON.stringify(rows);
      assert.equal(run().status, 1, 'fresh caller cannot duplicate an accepted explicit identity');
      rows = resolvePlanReviewAuthority(context).rows;
      assert.equal(JSON.stringify(rows), before);
      assert.equal(fs.readFileSync(path.join(project, 'starts'), 'utf8'), '1\n');
      assert.equal(rows.find(r => r.event_type === 'spawn_accepted').metadata.runFamilyId, 'separate-family');
    }
  });
});
