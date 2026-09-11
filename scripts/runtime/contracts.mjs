// Shared, side-effect-free primitives for runtime baseline observations.
// A digest binds data; it is never by itself load, review or operator authority.
import { createHash } from 'node:crypto';

export function parseCliOptions(argv,valueFlags,switchFlags=[]) {
  const out={};
  for(let i=0;i<argv.length;i++) {
    const key=argv[i];
    if(Object.hasOwn(out,key))throw new Error('USAGE');
    if(switchFlags.includes(key)){out[key]=true;continue;}
    if(!valueFlags.includes(key)||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('USAGE');
    out[key]=argv[++i];
  }
  return out;
}
export function requireCliOptions(opts,keys) {
  if(keys.some(key=>!opts[key]))throw new Error('USAGE');
}
export const SCHEMA_VERSION = 1;
export const INVENTORY_VERSION = 1;
export const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_NODES = 100_000;
const SHA256 = /^[a-f0-9]{64}$/;
const BASELINE_ID = /^baseline:[a-f0-9]{64}$/;

export const ERROR_CODES = Object.freeze([
  'SOURCE_UNAVAILABLE', 'OBSERVATION_LIMIT', 'ROOT_MISMATCH',
  'CONFIG_INVALID', 'CONFIG_UNCOVERED', 'LOAD_UNCONFIRMED',
  'SOURCE_DRIFT', 'CONFIG_DRIFT', 'SCOPE_NOT_ACCEPTED',
  'BASELINE_CORRUPT', 'CANDIDATE_CHANGED', 'EVIDENCE_MISMATCH',
  'SELECTION_CONFLICT', 'STORE_LOCKED', 'PATH_UNSAFE', 'ROLLBACK_UNPROVEN',
]);
const codes = new Set(ERROR_CODES);

export class RuntimeBaselineError extends Error {
  constructor(code) {
    // Deliberately never include raw input, local configuration or cause.message.
    const safeCode = codes.has(code) ? code : 'BASELINE_CORRUPT';
    super(safeCode);
    this.name = 'RuntimeBaselineError';
    this.code = safeCode;
  }
}

export function isSha256(value) {
  return typeof value === 'string' && SHA256.test(value);
}

export function isBaselineId(value) {
  return typeof value === 'string' && BASELINE_ID.test(value);
}

function invalid() { throw new RuntimeBaselineError('BASELINE_CORRUPT'); }
function limit() { throw new RuntimeBaselineError('OBSERVATION_LIMIT'); }

function dataDescriptors(item) {
  const array = Array.isArray(item);
  const proto = Object.getPrototypeOf(item);
  const expected = array ? Array.prototype : Object.prototype;
  if (proto !== expected && (array || proto !== null)) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(item);
  if (Reflect.ownKeys(descriptors).some(key => typeof key === 'symbol')) invalid();
  if (array) validateArrayDescriptors(item.length, descriptors);
  else for (const descriptor of Object.values(descriptors)) validateDataDescriptor(descriptor);
  return descriptors;
}

function validateDataDescriptor(descriptor) {
  if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid();
}

function validateArrayDescriptors(length, descriptors) {
  if (length > MAX_NODES) limit();
  if (Object.keys(descriptors).length !== length + 1) invalid();
  for (let i = 0; i < length; i++) validateDataDescriptor(descriptors[String(i)]);
}

function encodeContainer(item, depth, emit, encode) {
  const descriptors = dataDescriptors(item);
  const array = Array.isArray(item);
  const keys = array ? Array.from({length:item.length}, (_, i) => String(i)) : Object.keys(descriptors).sort();
  const parts = [emit(array ? '[' : '{')];
  for (const [i, key] of keys.entries()) {
    if (key.length > MAX_RECORD_BYTES) limit();
    if (i) parts.push(emit(','));
    if (!array) parts.push(emit(JSON.stringify(key)), emit(':'));
    parts.push(encode(descriptors[key].value, depth + 1));
  }
  parts.push(emit(array ? ']' : '}'));
  return parts.join('');
}

// Accept JSON data, not arbitrary live objects with getters/toJSON/prototypes.
// Serializing directly rather than rebuilding objects preserves lexical key order
// even for integer-looking property names (JSON.stringify reorders those keys).
export function canonicalJson(value) {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set();
  const emit = (text) => {
    bytes += Buffer.byteLength(text, 'utf8');
    if (bytes > MAX_RECORD_BYTES) limit();
    return text;
  };
  const encode = (item, depth) => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) limit();
    if (item === null) return emit('null');
    if (typeof item === 'string') {
      if (item.length > MAX_RECORD_BYTES) limit();
      return emit(JSON.stringify(item));
    }
    if (typeof item === 'boolean') return emit(item ? 'true' : 'false');
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) invalid();
      return emit(JSON.stringify(item));
    }
    if (typeof item !== 'object') invalid();
    if (ancestors.has(item)) invalid();
    ancestors.add(item);
    try { return encodeContainer(item, depth, emit, encode); }
    finally { ancestors.delete(item); }
  };
  return encode(value, 0);
}

// Fixed domains, not caller-provided strings that could be mistaken for another
// contract. Functions validate JSON encoding only; full schemas validate at the
// producer/reader boundary before these hashes are used for selection.
const digest = (domain, value) => createHash('sha256').update(domain + '\0').update(canonicalJson(value)).digest('hex');
export const configDigest = value => digest('pidex-effective-config-v1', value);
export const previewDigest = value => digest('pidex-baseline-preview-v1', value);
export const inventoryDigest = value => digest('pidex-runtime-inventory-v1', value);
export function baselineId(recordWithoutId) {
  if (!recordWithoutId || Array.isArray(recordWithoutId) || typeof recordWithoutId !== 'object'
      || Object.hasOwn(recordWithoutId, 'id')) invalid();
  return 'baseline:' + digest('pidex-working-baseline-v1', recordWithoutId);
}

export function parseRecordJson(bytes) {
  if (!(typeof bytes === 'string' || Buffer.isBuffer(bytes))) invalid();
  if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES) limit();
  try {
    const text = typeof bytes === 'string' ? bytes : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    // Bound depth/node count and prohibit unsupported data before use.
    canonicalJson(value);
    return value;
  } catch (error) {
    if (error instanceof RuntimeBaselineError) throw error;
    invalid();
  }
}
