import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { recordPipelineEvent, resolvePlanReviewAuthority } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';

// Registered public tool + real runner, but only a fixed credential-free dummy CLI.
// No closeout opt-in, no retrospective learning coordinator, no provider calls.
test('standard closeout trusts its validated producer result, not a second line-only parser', { skip: process.platform !== 'linux', timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-standard-closeout-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = path.join(root, 'runtime'); const stateDir = path.join(root, 'state'); const home = path.join(root, 'home'); const bin = path.join(root, 'bin');
  for (const dir of [home, bin, stateDir, ...['agents', 'config', 'scripts'].map(n => path.join(runtime, n))]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(runtime, 'package.json'), '{"name":"pidex","version":"0.0.0"}');
  fs.writeFileSync(path.join(runtime, 'config/agents.json'), JSON.stringify({ defaults: { provider: 'pi', model: 'openai-codex/gpt-5.6-terra', timeoutSeconds: 5 }, agents: {} }));
  for (const actor of ['pidex-pi', 'pidex-planner']) fs.writeFileSync(path.join(runtime, 'agents', actor + '.md'), `---\nname: ${actor}\n---\nSynthetic fixture only.`);
  for (const name of ['codex', 'claude', 'gemini']) fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 97\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'pi'), `#!/usr/bin/env node
const fs=require('node:fs'),p=require('node:path');const mode=p.basename(process.cwd());
const task=fs.readFileSync(process.argv.at(-1).slice(1),'utf8');const id=task.match(/closeout_dispatch: ([a-f0-9-]{36})/)?.[1];
const count=fs.existsSync('count')?Number(fs.readFileSync('count','utf8'))+1:1;fs.writeFileSync('count',String(count));
const artifact='agents.output/result/001.md';const nl=String.fromCharCode(10);
const text=['<!-- ROUTING','verdict: '+(mode==='blocked-compact'?'BLOCKED':'COMPLETE'),'route_to: orchestrator','post_retro_handoffs: none',...(id?['closeout_dispatch: '+id,'closeout_obligations: none']:[]),'context_file: '+artifact,'-->'].join(nl);
fs.mkdirSync(p.dirname(artifact),{recursive:true});if(!mode.includes('missing'))fs.writeFileSync(artifact,text);
let final=text;if(mode==='wrong-id')final=final.replace(id,'00000000-0000-0000-0000-000000000000');
if(mode==='duplicate')final=final.replace('-->','context_file: '+artifact+nl+'-->');
if(mode.includes('compact'))final=final.split(nl).join('; ').replace('ROUTING; ','ROUTING ').replace('; -->',' -->');
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:final}]}}));
`, { mode: 0o700 });
  const env = { HOME: home, PATH: bin + path.delimiter + process.env.PATH, PIDEX_ROOT: runtime, PIDEX_HOME_ROOT: runtime, PIDEX_STATE_DIR: stateDir, RUNNING_PI_STATE_DIR: stateDir, NODE_OPTIONS: '' };
  const url = new URL('../../extensions/pidex/index.ts', import.meta.url).href;
  for (const mode of ['compact', 'multiline', 'wrong-id', 'duplicate', 'missing', 'blocked-compact', 'ordinary-missing', 'ordinary-compact']) await t.test(mode, () => {
    const project = path.join(root, mode); fs.mkdirSync(project);
    const context = { project, stateDir, planId: 'plan-001', pipelineId: 'standard-' + mode };
    recordPipelineEvent({ ...context, plan: context.planId, event: 'pipeline_started' });
    const ordinary = mode.startsWith('ordinary-'); const positive = ['compact', 'multiline'].includes(mode);
    const params = { agent: ordinary ? 'pidex-planner' : 'pidex-pi', task: 'Plan: 001\nSynthetic fixture only.' };
    const script = `import extension from ${JSON.stringify(url)};const tools=new Map();extension({on(){},registerCommand(){},registerTool:t=>tools.set(t.name,t),getCommands:()=>[]});try{const r=await tools.get('pidex_agent').execute('fixture',${JSON.stringify(params)},undefined,undefined,{cwd:${JSON.stringify(project)},hasUI:false});console.log(JSON.stringify(r));}catch(e){console.error(e.message);process.exitCode=1;}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: project, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, positive ? 0 : 1, result.stderr);
    assert.equal(fs.readFileSync(path.join(project, 'count'), 'utf8'), '1');
    const rows = resolvePlanReviewAuthority(context).rows;
    assert.equal(rows.filter(r => r.event_type === 'pipeline_closeout_dispatch_finished').length, positive || mode === 'blocked-compact' ? 1 : 0);
    assert(!rows.some(r => r.event_type === 'pipeline_closeout_return_captured'));
    if (positive) { const end = rows.find(r => r.event_type === 'pipeline_closeout_dispatch_finished'); assert.equal(end.metadata.schema, 'pidex-closeout-v2'); assert.equal(end.metadata.outcome, 'completed'); assert.match(result.stdout, /dispatch_completed/); }
    if (mode === 'blocked-compact') assert.equal(rows.find(r => r.event_type === 'pipeline_closeout_dispatch_finished').metadata.outcome, 'failed');
    if (ordinary || mode === 'blocked-compact') assert.match(result.stderr, /invalid ROUTING context_file/);
  });
});
