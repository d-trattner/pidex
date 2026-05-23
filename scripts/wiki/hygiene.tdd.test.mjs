#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const script=path.join(root,'scripts/wiki/hygiene.mjs');
const tmp=mkdtempSync(path.join(os.tmpdir(),'pidex-wiki-hygiene-'));
try{mkdirSync(path.join(tmp,'wiki'),{recursive:true});writeFileSync(path.join(tmp,'wiki','index.md'),'# Index\n[missing](nope.md)\n','utf8');writeFileSync(path.join(tmp,'wiki','log.md'),'# Log\n','utf8');const cp=spawnSync(process.execPath,[script,'audit','--project',tmp,'--json-only'],{encoding:'utf8'});assert.equal(cp.status,0,cp.stderr||cp.stdout);const line=cp.stdout.split(/\r?\n/).find(l=>l.startsWith('PIDEX_WIKI_HYGIENE_RESULT='));assert.ok(line);const data=JSON.parse(line.slice('PIDEX_WIKI_HYGIENE_RESULT='.length));assert.equal(data.high,1);assert.ok(existsSync(data.report_json));const cad=spawnSync(process.execPath,[script,'cadence','--project',tmp,'--plan','plan-001','--pipeline-id','p','--terminal-event','pipeline_completed'],{encoding:'utf8'});assert.equal(cad.status,0,cad.stderr||cad.stdout);assert.ok(existsSync(path.join(tmp,'pidex','state','wiki-hygiene.json')))}finally{rmSync(tmp,{recursive:true,force:true})}
console.log('wiki hygiene.mjs tests passed');
