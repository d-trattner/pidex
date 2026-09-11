import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Force the real writer to pause between open and write. Readers may wait for
// publication, but must not observe an empty owner as a committed corrupt lock.
test('concurrent TBR waiter never sees partially published owner JSON', { skip: process.platform !== 'linux', timeout: 12_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-publication-'));
  const children = [];
  t.after(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); fs.rmSync(root, { recursive: true, force: true }); });
  const library = new URL('../../modules/pidex/analysis-metrics-history/lib/tbr-lock.mjs', import.meta.url).href;
  const worker = path.join(root, 'worker.mjs');
  fs.writeFileSync(worker, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const root=${JSON.stringify(root)}, mode=process.argv[2];const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
const wait=file=>{const end=Date.now()+4000;while(!fs.existsSync(root+'/'+file)){if(Date.now()>end)throw Error('fixture deadline');sleep(5);}};
if(mode==='creator') {const original=fs.writeSync;let injected=false;fs.writeSync=function(fd,...args){let target='';try{target=fs.readlinkSync('/proc/self/fd/'+fd);}catch{}if(!injected&&target.includes('/.tbr-')){injected=true;fs.writeFileSync(root+'/opened','1');wait('waiter-entered');sleep(200);}return original.call(fs,fd,...args);};syncBuiltinESMExports();}
const {acquireProjectTbrLock,releaseProjectTbrLock}=await import(${JSON.stringify(library)});
if(mode==='waiter'){fs.writeFileSync(root+'/waiter-ready','1');wait('opened');fs.writeFileSync(root+'/waiter-entered','1');}
const result=acquireProjectTbrLock({stateDir:root+'/state',project:root,lockTimeoutMs:1500});
if(result.held){if(mode==='creator')sleep(100);releaseProjectTbrLock(result.lock);}
fs.writeFileSync(root+'/'+mode+'.json',JSON.stringify(result));
`);
  const run = mode => {
    const child = spawn(process.execPath, [worker, mode], { stdio: ['ignore', 'ignore', 'pipe'] }); children.push(child);
    let error = ''; child.stderr.on('data', b => { error += b; });
    return once(child, 'close').then(([code]) => { assert.equal(code, 0, error); });
  };
  const waiter = run('waiter');
  const deadline = Date.now() + 4000;
  while (!fs.existsSync(path.join(root, 'waiter-ready'))) { assert.ok(Date.now() < deadline); await new Promise(r => setTimeout(r, 10)); }
  await Promise.all([run('creator'), waiter]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'creator.json'))).held, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'waiter.json'))).held, true, 'wait for atomic publication, never adopt or delete a stale lock');
});
