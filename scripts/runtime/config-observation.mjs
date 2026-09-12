import * as fs from 'node:fs';
import path from 'node:path';
import { configDigest, RuntimeBaselineError } from './contracts.mjs';
import { readJson, issue } from './io.mjs';
import { loadModuleSystem, moduleEnabled } from '../modules/lib.mjs';
import { observeInventory } from './identity.mjs';
import { normalizeConfig as normalizeParallelConfig } from '../../modules/pidex/parallel-agents/lib/config.mjs';

const fail = () => {throw new RuntimeBaselineError('CONFIG_UNCOVERED');};
const object = v => {if(!v || typeof v!=='object' || Array.isArray(v))fail();return v;};
function fields(raw, allowed, ignored = []) {
  object(raw);
  for(const key of Object.keys(raw)) if(!allowed.includes(key) && !ignored.includes(key))fail();
}
const STRING_FIELDS=['provider','model','effort','permission_mode','principal','condition'];
const LIST_FIELDS=['tools','allowed_tools','disallowed_tools','add_dirs'];
const ROUTE_FIELDS=[...STRING_FIELDS,...LIST_FIELDS,'timeout_seconds','dangerously_skip_permissions'];
function routeProjection(raw) {
  fields(raw,ROUTE_FIELDS,['notes','parallel_secondary']);
  // parallel_secondary is not an eligible route source in the host boundary.
  const out={};
  for(const key of ROUTE_FIELDS) {
    if(raw[key]===undefined)continue;
    const value=raw[key];
    if(STRING_FIELDS.includes(key) && typeof value!=='string')fail();
    if(LIST_FIELDS.includes(key) && (!Array.isArray(value)||!value.every(v=>typeof v==='string')))fail();
    if(key==='timeout_seconds' && (!Number.isFinite(value)||value<=0))fail();
    if(key==='dangerously_skip_permissions' && typeof value!=='boolean')fail();
    out[key]=value;
  }
  return out;
}
// Shared with the existing execution resolver; preserve spread precedence.
export function mergeRoute(config,agent) {return {...(config.defaults??{}),...(config.agents?.[agent]??{})};}
export function mergeSandbox(base,override) {
  const out={...base};
  for(const [key,value] of Object.entries(override||{})) {
    if(value && typeof value==='object' && !Array.isArray(value) && out[key] && typeof out[key]==='object' && !Array.isArray(out[key]))out[key]=mergeSandbox(out[key],value);
    else out[key]=value;
  }
  return out;
}
function readOptional(root,rel,fallback) {
  try{return readJson(root,rel);}catch(error){if(error.code==='ENOENT')return fallback;throw error;}
}
function routing(root) {
  const raw=readOptional(root,'config/agents.json',{defaults:{provider:'pi'},agents:{},fallback:{on_error:'pi'}});
  fields(raw,['defaults','agents','fallback'],['$schema','version','description']);
  const agents={};
  routeProjection(raw.defaults??{});
  for(const [name,value] of Object.entries(object(raw.agents??{}))) {
    if(!/^pidex-[a-z0-9-]+$/.test(name))fail();
    routeProjection(value);
    agents[name]=routeProjection(mergeRoute(raw,name));
  }
  const fallback=raw.fallback??{};
  fields(fallback,['on_error'],['retries','reason_prefix']);
  if(fallback.on_error!==undefined && typeof fallback.on_error!=='string')fail();
  return {defaults:routeProjection(raw.defaults??{}),agents,fallback:fallback.on_error===undefined?{}:{on_error:fallback.on_error}};
}
function sandboxProfile(profile) {
  fields(profile,['enabled','image','network_default','memory','cpus','pids_limit','timeout_seconds','preserve_on_failure','container_user_mode','container_user_enforced']);
  for(const [key,value] of Object.entries(profile)) {
    if(['enabled','preserve_on_failure','container_user_enforced'].includes(key) && typeof value!=='boolean')fail();
    if(['cpus','pids_limit','timeout_seconds'].includes(key) && (!Number.isFinite(value)||value<=0))fail();
    if(['image','network_default','memory','container_user_mode'].includes(key) && typeof value!=='string')fail();
  }
}
function sandboxInput(input) {
  fields(input,['enabled','default_mode','profiles']);
  Object.values(object(input.profiles??{})).forEach(sandboxProfile);
  if(input.enabled!==undefined && typeof input.enabled!=='boolean')fail();
  if(input.default_mode!==undefined && typeof input.default_mode!=='string')fail();
}
function sandbox(root) {
  const base=readOptional(root,'config/sandbox.json',{enabled:false,default_mode:'off',profiles:{}});
  const local=readOptional(root,'config/sandbox.local.json',{});
  [base,local].forEach(sandboxInput);
  return mergeSandbox(base,local);
}
function modules(root) {
  const config=readOptional(root,'config/modules.json',{modules:{}});
  const local=readOptional(root,'config/modules.local.json',{modules:{}});
  for(const input of [config,local]) {
    fields(input,['modules']);
    for(const item of Object.values(object(input.modules??{}))) {
      fields(item,['enabled']);if(typeof item.enabled!=='boolean')fail();
    }
  }
  // Module manifests/defaults/dependencies are bound by the source inventory.
  // This is the same module-level shallow override used by loadModuleSystem.
  observeInventory(root);
  const system=loadModuleSystem(root);
  const effective={};
  for(const {manifest} of system.modules)effective[manifest.id]=moduleEnabled(system,manifest).enabled;
  for(const {manifest} of system.modules)if(effective[manifest.id]&&(manifest.dependencies??[]).some(id=>!effective[id]))fail();
  return {overrides:{...(config.modules??{}),...(local.modules??{})},effective};
}
function parallel(root) {
  const rel=fs.existsSync(path.join(root,'config/parallel-agents.local.json'))?'config/parallel-agents.local.json':'config/parallel-agents.json';
  const raw=readOptional(root,rel,{});
  fields(raw,['schema_version','enabled','default_mode','dedupe_hours','max_provider_models_per_agent','agents'],['description']);
  for(const value of Object.values(object(raw.agents??{}))) {
    fields(value,['enabled','trigger','mode','timeout_seconds','notify_on_unavailable','provider_models']);
    for(const pm of value.provider_models??[])fields(pm,['provider','model','effort','enabled']);
  }
  const [config,errors]=normalizeParallelConfig(raw);
  if(errors.length)fail();
  return {source:rel,config};
}
export function normalizeGovernorConfig(defaults,local) {
  const merged = { ...defaults, ...local };
  const unknownKeys = Object.keys(merged).filter((key) => !['$schema', 'version', 'capability', 'max_proposals_per_run'].includes(key));
  if (unknownKeys.length) throw new Error(`GOVERNOR_CONFIG_INVALID: unknown fields ${unknownKeys.join(',')}`);
  if (merged.version !== 2 || merged.capability !== 'manual-pending-only') throw new Error('GOVERNOR_CONFIG_INVALID: expected version 2 manual-pending-only');
  const max = Number(merged.max_proposals_per_run ?? 5);
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error('GOVERNOR_CONFIG_INVALID: max_proposals_per_run must be 1..20');
  return { version: 2, capability: 'manual-pending-only', max_proposals_per_run: max };
}
function auxiliary(root) {
  // These optional inputs have no safely closed adapter yet. Detect presence
  // without opening local pricing, balance or operator-contract payloads.
  for(const rel of ['config/pricing.json','config/balance.local.json','config/dashboard.local.json','config/operator-contracts.local.json'])if(fs.existsSync(path.join(root,rel)))fail();
  const governor=readOptional(root,'config/contract-governor.json',{$schema:'https://pidex.dev/contract-governor.schema.json',version:2,capability:'manual-pending-only',max_proposals_per_run:5});
  const local=readOptional(root,'config/contract-governor.local.json',{});
  for(const value of [governor,local])fields(value,['$schema','version','capability','max_proposals_per_run']);
  const effective=normalizeGovernorConfig(governor,local);
  const balance=readOptional(root,'config/balance.json',{schema_version:1,providers:[]});fields(balance,['schema_version','providers']);
  if(balance.schema_version!==1||!Array.isArray(balance.providers)||balance.providers.length)fail();
  const dashboard=readOptional(root,'config/dashboard.json',{domain:null});fields(dashboard,['domain']);
  if(dashboard.domain!==null&&(typeof dashboard.domain!=='string'||!/^[a-z0-9.-]+$/i.test(dashboard.domain)))fail();
  return {governor:effective,balance,dashboard};
}
function ruleSeed(root) {
  const raw=readOptional(root,'config/rule-baseline-manifest.json',null);
  if(raw===null)return null;
  fields(raw,['schema','source_kind','baseline_parent_commit','agent_count','rule_count','agents','rules','aggregate_digest']);
  if(raw.schema!=='pidex-bundled-rule-seed-v1'||raw.source_kind!=='packaged_baseline'||!(/^[a-f0-9]{40}$/).test(raw.baseline_parent_commit))fail();
  for(const [name,keys] of [['agents',['path','byte_hash']],['rules',['rule_id','path','byte_hash','protection_class']]]) {
    if(!Array.isArray(raw[name]))fail();
    for(const row of raw[name]){fields(row,keys);if(!(/^(agents|rules)\/[a-z0-9_./-]+\.md$/).test(row.path)||!(/^[a-f0-9]{64}$/).test(row.byte_hash))fail();}
  }
  if(!(/^[a-f0-9]{64}$/).test(raw.aggregate_digest)||!Number.isInteger(raw.agent_count)||!Number.isInteger(raw.rule_count))fail();
  return raw;
}
const ROOT_ENV=new Set(['PIDEX_ROOT','PIDEX_HOME_ROOT','PIDEX_STATE_DIR','RUNNING_PI_STATE_DIR']);
const FLAGS=['PIDEX_ALLOW_ANTHROPIC','PIDEX_LIFECYCLE_ACTION_ENABLED'];
const CONTEXT_ENV=new Set(['PIDEX_PIPELINE_ID','RUNNING_PI_PIPELINE_ID','PIDEX_CHILD','PIDEX_SUPPRESS_AGENT_GATE_NOTIFY','PIDEX_PARALLEL_GATE_NOTIFY_AFTER_MERGE','PIDEX_TELEGRAM_GATES','PIDEX_TELEGRAM_PARALLEL_WARNINGS','PIDEX_BASELINE_ID','PIDEX_BASELINE_LAUNCH_ID']);
export function observeEffectiveConfig({runtimeRoot,env=process.env}) {
  const issues=[],projection={};
  for(const key of Object.keys(env)) {
    if(!env[key])continue;
    if((key.startsWith('PIDEX_')||key.startsWith('RUNNING_PI_')) && !ROOT_ENV.has(key) && !CONTEXT_ENV.has(key) && !FLAGS.includes(key)) {
      issues.push({code:'CONFIG_UNCOVERED',component:'environment'});
    }
  }
  if(env.NODE_OPTIONS || env.NODE_PATH || env.BASH_ENV)issues.push({code:'CONFIG_UNCOVERED',component:'external-loader'});
  projection.flags={};
  for(const key of FLAGS) {
    const value=env[key]??'';
    if(!['','0','1','false','true'].includes(value))issues.push({code:'CONFIG_UNCOVERED',component:'flags'});
    else projection.flags[key]=key==='PIDEX_ALLOW_ANTHROPIC'?value==='1':Boolean(value);
  }
  for(const [name,read] of Object.entries({routing,sandbox,modules,parallel,ruleSeed,auxiliary})) {
    try{projection[name]=read(runtimeRoot);}catch(error){issues.push(error.code==='BASELINE_CORRUPT'?{code:'CONFIG_INVALID',component:name}:issue(error,name,'CONFIG_INVALID'));}
  }
  const unique=[...new Map(issues.map(i=>[i.code+':'+i.component,i])).values()];
  return {schema_version:1,projection,digest:unique.length?null:configDigest(projection),coverage:unique.length?'incomplete':'complete',issues:unique};
}
