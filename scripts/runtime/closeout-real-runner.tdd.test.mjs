import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { recordPipelineEvent, resolvePlanReviewAuthority } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';
import { processMatches, signalExecutionChild } from './review-execution.mjs';

// Real runConfiguredAgent/runRpAgent, but ONLY a fixed local fake executable.
// Every other provider executable is replaced by a refusing shim; no credentials.
test('real runner captures once; malformed return cannot trigger same-provider retry; replay skips executable', { skip: process.platform !== 'linux', timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-closeout-runner-')); const runtime = path.join(root, 'runtime'); const stateDir = path.join(root, 'state'); const bin = path.join(root, 'bin'); const home = path.join(root, 'home');
  for (const dir of [stateDir, bin, home, path.join(runtime, 'agents'), path.join(runtime, 'config'), path.join(runtime, 'scripts')]) fs.mkdirSync(dir, { recursive: true });
  t.after(async () => {
    const dir = path.join(stateDir, 'closeout-executions'); const refs = fs.existsSync(dir) ? fs.readdirSync(dir).map(n => path.join(dir, n, 'started.json')).filter(f => fs.existsSync(f)).map(f => JSON.parse(fs.readFileSync(f, 'utf8')).supervisor) : [];
    for (const ref of refs) if (processMatches(ref)) signalExecutionChild(ref, 'SIGTERM');
    for (let i = 0; i < 100 && refs.some(processMatches); i++) await new Promise(r => setTimeout(r, 30));
    assert(!refs.some(processMatches), 'owned fixture supervisor did not stop; retain fixture rather than erase evidence'); fs.rmSync(root, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(runtime, 'package.json'), '{"name":"pidex","version":"0.0.0"}');
  fs.writeFileSync(path.join(runtime, 'config/agents.json'), JSON.stringify({ defaults: { provider: 'pi', model: 'openai-codex/gpt-5.6-terra', timeoutSeconds: 10 }, agents: {} }));
  fs.writeFileSync(path.join(runtime, 'agents/pidex-retrospective.md'), '---\nname: pidex-retrospective\n---\nSynthetic fixture only.');
  for (const name of ['codex', 'claude', 'gemini']) fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 97\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'pi'), `#!/usr/bin/env node
const fs=require('node:fs'),p=require('node:path');const args=process.argv.slice(2);const task=fs.readFileSync(args.at(-1).slice(1),'utf8');
const n=fs.existsSync('count')?Number(fs.readFileSync('count','utf8'))+1:1;fs.writeFileSync('count',String(n));
const id=task.match(/closeout_dispatch: ([a-f0-9-]{36})/)[1];const artifact='agents.output/retro/001.md';
const text=['<!-- ROUTING','verdict: COMPLETE','route_to: pidex-pi','post_retro_handoffs: none','closeout_dispatch: '+id,'closeout_obligations: none','context_file: '+artifact,'-->'].join(String.fromCharCode(10));
fs.mkdirSync(p.dirname(artifact),{recursive:true});fs.writeFileSync(artifact,text);
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:p.basename(process.cwd())==='invalid'?'unparseable fixture return':text.split(String.fromCharCode(10)).join('; ').replace('ROUTING; ','ROUTING ').replace('; -->',' -->')}]}}));
`, { mode: 0o700 });
  const moduleUrl = new URL('../../extensions/pidex/index.ts', import.meta.url).href;
  const env = { HOME: home, PATH: bin + path.delimiter + process.env.PATH, PIDEX_ROOT: runtime, PIDEX_HOME_ROOT: runtime, PIDEX_STATE_DIR: stateDir, RUNNING_PI_STATE_DIR: stateDir, NODE_OPTIONS: '' };
  for (const mode of ['valid', 'invalid']) {
    const project = path.join(root, mode); fs.mkdirSync(project); const context = { project, stateDir, pipelineId: `runner-${mode}`, planId: 'plan-001' };
    recordPipelineEvent({ ...context, plan: context.planId, event: 'pipeline_started' });
    const request = { action: 'start', planId: context.planId, pipelineId: context.pipelineId, artifactPath: 'agents.output/retro/001.md' };
    const run = closeout => spawnSync(process.execPath, ['--input-type=module', '-e', `import extension from ${JSON.stringify(moduleUrl)};const tools=new Map();extension({on(){},registerCommand(){},registerTool:t=>tools.set(t.name,t),getCommands:()=>[]});try {const r=await tools.get('pidex_agent').execute('fixture',${JSON.stringify({ agent: 'pidex-retrospective', task: 'Synthetic fixture only', closeout })},undefined,undefined,{cwd:${JSON.stringify(project)},hasUI:false});console.log(JSON.stringify(r));}catch(e){console.error(e.message);process.exitCode=1;}`], { cwd: project, env, encoding: 'utf8', timeout: 20000 });
    const first = run(request); assert.equal(first.status, mode === 'valid' ? 0 : 1, first.stderr);
    const rows = resolvePlanReviewAuthority(context).rows; const id = rows.find(r => r.event_type === 'pipeline_closeout_dispatch_started').metadata.id;
    assert.equal(rows.filter(r => r.event_type === 'pipeline_closeout_return_captured').length, 1); assert.equal(fs.readFileSync(path.join(project, 'count'), 'utf8'), '1');
    if (mode === 'valid') fs.unlinkSync(path.join(project, request.artifactPath));
    const replay = run({ ...request, action: 'resume', dispatchId: id }); assert.equal(replay.status, mode === 'valid' ? 0 : 1, replay.stderr); assert.equal(fs.readFileSync(path.join(project, 'count'), 'utf8'), '1');
    if (mode === 'valid') { const result = JSON.parse(replay.stdout.trim().split('\n').at(-1)); assert.match(result.content[0].text, /replayed=true/); assert.match(result.content[0].text, /learning=deferred/); }
    else { assert.match(first.stderr, /ROUTING_INVALID/); assert.match(replay.stderr, /ROUTING_INVALID/); }
  }
});
