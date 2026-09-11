import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  canonicalJson, configDigest, previewDigest, inventoryDigest, baselineId,
  isSha256, isBaselineId, RuntimeBaselineError, parseRecordJson, MAX_RECORD_BYTES,
} from './contracts.mjs';

const corrupt = fn => assert.throws(fn, {name:'RuntimeBaselineError', code:'BASELINE_CORRUPT'});
const limited = fn => assert.throws(fn, {name:'RuntimeBaselineError', code:'OBSERVATION_LIMIT'});

test('canonical JSON sorts recursively, including integer-looking keys', () => {
  assert.equal(canonicalJson({z:1,a:{'2':2,'10':10,b:3}}), '{"a":{"10":10,"2":2,"b":3},"z":1}');
  assert.equal(configDigest({b:2,a:1}),configDigest({a:1,b:2}));
});
test('formatting is not configuration drift', () => {
  assert.equal(configDigest(parseRecordJson('{"a":1,"b":2}')),configDigest(parseRecordJson(' { "b": 2,\n"a": 1 } ')));
});
test('arrays retain order and null remains distinct from missing', () => {
  assert.notEqual(configDigest(['a','b']),configDigest(['b','a']));
  assert.notEqual(configDigest({a:null}),configDigest({}));
  assert.equal(canonicalJson([null,true,false,'ä\n',-0]),'[null,true,false,"ä\\n",0]');
});
test('hash domains cannot be confused', () => {
  const value={schema_version:1};
  const hashes=[configDigest(value),previewDigest(value),inventoryDigest(value),baselineId(value).slice(9)];
  assert.equal(new Set(hashes).size,4);
  assert.ok(hashes.every(isSha256));
  assert.equal(baselineId(value),'baseline:'+createHash('sha256').update('pidex-working-baseline-v1\0'+canonicalJson(value)).digest('hex'));
});
test('baseline identity refuses a self-referential id field', () => {
  corrupt(()=>baselineId({id:'baseline:'+'a'.repeat(64)}));
  for(const value of [null,[],1,'x']) corrupt(()=>baselineId(value));
});
test('digest and record identifiers reject paths and noncanonical variants', () => {
  assert.ok(isSha256('a'.repeat(64)));
  assert.ok(isBaselineId('baseline:'+'0'.repeat(64)));
  for(const value of [null,{},'A'.repeat(64),'a'.repeat(63),'a'.repeat(64)+'\n','../x']) assert.equal(isSha256(value),false);
  for(const value of ['../x','baseline:'+'A'.repeat(64),'baseline:'+'a'.repeat(64)+'/x',null]) assert.equal(isBaselineId(value),false);
});
for(const [label,value] of [['undefined',undefined],['NaN',NaN],['infinity',Infinity],['bigint',1n],['function',()=>{}],['symbol',Symbol('x')],['date',new Date(0)],['map',new Map()],['buffer',Buffer.from('x')]]) {
  test('unsupported JSON input rejected: '+label,()=>corrupt(()=>canonicalJson({value})));
}
test('accessors and toJSON are not executed', () => {
  let calls=0;
  const getter={get secret(){calls++;return 'DO_NOT_EXPOSE';}};
  corrupt(()=>canonicalJson(getter));
  corrupt(()=>canonicalJson({toJSON(){calls++;return {};}}));
  assert.equal(calls,0);
});
test('hidden/symbol fields and custom prototypes cannot be silently omitted', () => {
  corrupt(()=>canonicalJson(Object.defineProperty({},'hidden',{value:1})));
  corrupt(()=>canonicalJson({[Symbol('secret')]:1}));
  corrupt(()=>canonicalJson(Object.create({inherited:1})));
  assert.equal(canonicalJson(Object.assign(Object.create(null),{a:1})),'{"a":1}');
});
test('sparse arrays and additional properties are rejected', () => {
  corrupt(()=>canonicalJson(new Array(1)));
  const extra=[1];extra.note='hidden';corrupt(()=>canonicalJson(extra));
  const getter=[];Object.defineProperty(getter,'0',{get(){throw new Error('not executed');},enumerable:true});
  corrupt(()=>canonicalJson(getter));
});
test('cycles reject but shared noncyclic values encode normally', () => {
  const cyclic={};cyclic.self=cyclic;corrupt(()=>canonicalJson(cyclic));
  const child={a:1};assert.equal(canonicalJson({a:child,b:child}),'{"a":{"a":1},"b":{"a":1}}');
});
test('depth, node and UTF-8 byte budgets are enforced', () => {
  let deep=null;for(let i=0;i<66;i++)deep=[deep];limited(()=>canonicalJson(deep));
  limited(()=>canonicalJson(Array(100001).fill(null)));
  limited(()=>canonicalJson('ä'.repeat(MAX_RECORD_BYTES/2)));
  limited(()=>parseRecordJson(' '.repeat(MAX_RECORD_BYTES+1)));
});
test('exact byte limit is accepted; a single additional byte is rejected', () => {
  assert.equal(Buffer.byteLength(canonicalJson('x'.repeat(MAX_RECORD_BYTES-2))),MAX_RECORD_BYTES);
  limited(()=>canonicalJson('x'.repeat(MAX_RECORD_BYTES-1)));
});
test('record parsing rejects malformed JSON/UTF8 without reflecting raw content', () => {
  assert.deepEqual(parseRecordJson(Buffer.from('{"schema_version":1}')),{schema_version:1});
  corrupt(()=>parseRecordJson(Buffer.from([0xff])));
  corrupt(()=>parseRecordJson('{"secret":"SENTINEL"'));
  corrupt(()=>parseRecordJson({}));
  assert.equal(new RuntimeBaselineError('SENTINEL').message,'BASELINE_CORRUPT');
});
test('__proto__ remains an ordinary own JSON key, not prototype mutation', () => {
  const parsed=parseRecordJson('{"__proto__":{"polluted":true}}');
  assert.equal(canonicalJson(parsed),'{"__proto__":{"polluted":true}}');
  assert.equal({}.polluted,undefined);
});
