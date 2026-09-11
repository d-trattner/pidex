import * as fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inventoryDigest, canonicalJson, RuntimeBaselineError } from './contracts.mjs';
import { readBounded, readJson, issue } from './io.mjs';

const ROOTS = ['extensions','scripts','modules','agents','prompts','skills','rules'];
const OMIT = new Set(['node_modules','.git','state','agents.output','logs','cache','fixtures','__fixtures__','test','tests','__tests__']);
const SOURCE_TYPES = new Set(['.ts','.js','.mjs','.cjs','.sh','.ps1','.py']);
const RESOURCE_TYPES = new Set(['.md','.txt','.json']);
const ROOT_FILES = ['package.json','pnpm-lock.yaml'];
const LIMITS = {files:20_000, fileBytes:16*1024*1024, totalBytes:256*1024*1024, millis:5000};
function excluded(name) {
  return OMIT.has(name) || name.startsWith('.') || /(?:\.test|\.tdd|\.spec)\./.test(name)
    || /\.local\./.test(name) || /^(?:secrets?|auth|credentials)\.(?:json|txt|ya?ml)$/.test(name)
    || ['LICENSE','NOTICE'].includes(name);
}
function included(rel) {
  const ext = path.extname(rel);
  if (SOURCE_TYPES.has(ext)) return true;
  if (/^(agents|prompts|skills|rules)\//.test(rel)) return RESOURCE_TYPES.has(ext);
  if (rel.startsWith('modules/')) return RESOURCE_TYPES.has(ext) || ['Dockerfile','pre-commit','commit-msg'].includes(path.basename(rel));
  return false;
}

// Enumeration is bounded and does not open excluded auth/state/local-config
// files. New source files under the declared roots participate in the digest.
export function observeInventory(root, {clock = Date.now, limits = LIMITS, readFile = readBounded} = {}) {
  const started = clock();
  const trackedResult=spawnSync('git',['-C',root,'-c','core.fsmonitor=false','ls-files','-z'],{shell:false,encoding:'utf8',timeout:2000,maxBuffer:1024*1024,env:{PATH:process.env.PATH,GIT_OPTIONAL_LOCKS:'0'}});
  if(trackedResult.error||trackedResult.status!==0)throw new RuntimeBaselineError('SOURCE_UNAVAILABLE');
  const tracked=new Set(trackedResult.stdout.split('\0'));
  let visits = 0, total = 0;
  const rows = [];
  const check = () => {
    if (++visits > limits.files || clock()-started > limits.millis) throw new RuntimeBaselineError('OBSERVATION_LIMIT');
  };
  const add = rel => {
    check();
    // Never hash arbitrary untracked/ignored JSON or local resources. A new
    // runtime candidate is explicitly incomplete until added to the source
    // inventory (Git index); accepting still requires a clean committed tree.
    if(!tracked.has(rel))throw new RuntimeBaselineError('CONFIG_UNCOVERED');
    const {bytes,stat} = readFile(root,rel,limits.fileBytes);
    total += bytes.length;
    if(total > limits.totalBytes) throw new RuntimeBaselineError('OBSERVATION_LIMIT');
    rows.push({relative_path:rel,size:bytes.length,executable:(stat.mode & 0o111)!==0,sha256:createHash('sha256').update(bytes).digest('hex')});
  };
  const walk = rel => {
    check();
    const dir = path.join(root,rel);
    const stat = fs.lstatSync(dir);
    if(stat.isSymbolicLink()) throw new RuntimeBaselineError('PATH_UNSAFE');
    if(!stat.isDirectory()) throw new RuntimeBaselineError('PATH_UNSAFE');
    const entries = fs.readdirSync(dir,{withFileTypes:true});
    for(const entry of entries) {
      check();
      if(excluded(entry.name)) {
        if(entry.isDirectory()&&`${rel}/${entry.name}`!=='scripts/quality/fixtures')throw new RuntimeBaselineError('CONFIG_UNCOVERED');
        if(entry.name.startsWith('.')&&SOURCE_TYPES.has(path.extname(entry.name)))throw new RuntimeBaselineError('CONFIG_UNCOVERED');
        continue;
      }
      const child = rel+'/'+entry.name;
      if(entry.isSymbolicLink()) throw new RuntimeBaselineError('PATH_UNSAFE');
      if(entry.isDirectory()) walk(child);
      else if(entry.isFile() && included(child)) add(child);
    }
  };
  for(const file of ROOT_FILES) add(file);
  for(const dir of ROOTS) walk(dir);
  rows.sort((a,b)=>Buffer.compare(Buffer.from(a.relative_path),Buffer.from(b.relative_path)));
  return {inventory_version:1,inventory_digest:inventoryDigest(rows),files:rows.length,bytes:total};
}
function git(root,args,runner) {
  const proc = runner('git',['-c','core.fsmonitor=false','-C',root,...args],{
    shell:false,encoding:'utf8',timeout:2000,maxBuffer:1024*1024,
    env:{PATH:process.env.PATH,HOME:process.env.HOME,SystemRoot:process.env.SystemRoot,GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1'},
  });
  if(proc.error || proc.status !== 0) throw new RuntimeBaselineError('SOURCE_UNAVAILABLE');
  return proc.stdout;
}
export function gitObservation(root, runner = spawnSync) {
  const top=fs.realpathSync(git(root,['rev-parse','--show-toplevel'],runner).trim());
  if(top!==root) throw new RuntimeBaselineError('ROOT_MISMATCH');
  const commit=git(root,['rev-parse','HEAD'],runner).trim();
  if(!/^[a-f0-9]{40,64}$/.test(commit)) throw new RuntimeBaselineError('SOURCE_UNAVAILABLE');
  let branch=null;
  const symbolic=runner('git',['-C',root,'symbolic-ref','--quiet','--short','HEAD'],{shell:false,encoding:'utf8',timeout:2000,maxBuffer:1024*1024,env:{PATH:process.env.PATH,GIT_OPTIONAL_LOCKS:'0'}});
  if(symbolic.status===0) branch=symbolic.stdout.trim();
  else if(symbolic.status!==1 || symbolic.error) throw new RuntimeBaselineError('SOURCE_UNAVAILABLE');
  const entries=git(root,['status','--porcelain=v1','-z','--untracked-files=normal','--ignore-submodules=all'],runner).split('\0');
  const dirty={tracked:false,untracked:false};
  for(let i=0;i<entries.length;i++) {
    const entry=entries[i];if(!entry)continue;
    if(entry.startsWith('?? '))dirty.untracked=true;
    else {
      if(entry.length<4 || entry[2]!==' ')throw new RuntimeBaselineError('SOURCE_UNAVAILABLE');
      dirty.tracked=true;
      if(/[RC]/.test(entry.slice(0,2))) i++;
    }
  }
  return {commit,branch,dirty};
}
export function observeSource({bootstrapRoot,runtimeRoot,stateRoot}, deps = {}) {
  const issues=[];
  const started=(deps.clock??Date.now)();
  const cache=new Map();
  function observe(input,component) {
    const result={root:path.resolve(input),commit:null,branch:null,dirty:null,package_version:null,inventory_version:1,inventory_digest:null};
    try { result.root=fs.realpathSync(result.root); }
    catch(error){issues.push(issue(error,component));return result;}
    if(cache.has(result.root)) return structuredClone(cache.get(result.root));
    try { Object.assign(result,gitObservation(result.root,deps.gitRunner)); }
    catch(error){issues.push(issue(error,component));}
    try {
      const pkg=readJson(result.root,'package.json');
      if(!['@d-trattner/pidex','pidex'].includes(pkg.name) || typeof pkg.version!=='string') throw new RuntimeBaselineError('SOURCE_UNAVAILABLE');
      result.package_version=pkg.version;
      Object.assign(result,observeInventory(result.root,deps));
      const after=gitObservation(result.root,deps.gitRunner);
      if(canonicalJson(after)!==canonicalJson({commit:result.commit,branch:result.branch,dirty:result.dirty}))throw new RuntimeBaselineError('CANDIDATE_CHANGED');
    }catch(error){issues.push(issue(error,component));}
    cache.set(result.root,result);
    return structuredClone(result);
  }
  const bootstrap=observe(bootstrapRoot,'bootstrap');
  const runtime=observe(runtimeRoot,'runtime');
  if((deps.clock??Date.now)()-started>LIMITS.millis)issues.push({code:'OBSERVATION_LIMIT',component:'source'});
  return {schema_version:1,observed_at:new Date().toISOString(),bootstrap,runtime,state_root:path.resolve(stateRoot),coverage:issues.length?'incomplete':'complete',issues};
}
export function sourceBinding(source) {
  const select = s => ({root:s.root,commit:s.commit,inventory_version:s.inventory_version,inventory_digest:s.inventory_digest});
  return {bootstrap:select(source.bootstrap),runtime:select(source.runtime),state_root:source.state_root};
}
