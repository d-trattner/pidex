#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
function parse(argv){const a={project:ROOT,plan:'unknown-plan'};for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--'))a[argv[i].slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=argv[++i];}return a}
const a=parse(process.argv.slice(2));
if(['0','false','no','off'].includes(String(process.env.PIDEX_AUTO_PDQ||'1').toLowerCase()))process.exit(0);
const script=path.join(ROOT,'scripts','quality','report.mjs');
if(!existsSync(script))process.exit(0);
const cp=spawnSync(process.execPath,[script,'--project',a.project,'--plan',a.plan],{cwd:ROOT,encoding:'utf8',timeout:Number(process.env.PIDEX_AUTO_PDQ_TIMEOUT_SECONDS||120)*1000});
if(cp.stdout.trim())console.log(cp.stdout.trim());
if(cp.status!==0){if(cp.stderr.trim())console.error(cp.stderr.trim());process.exit(cp.status||1)}
