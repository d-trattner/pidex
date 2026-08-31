import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function angularModulePidexRoot(importMetaUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '../../../..');
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonicalMembers(members) { return members.map((m) => `${m.path}\0${m.bytes}\0${m.sha256}\n`).join(''); }

function walkRegular(root, dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error(`ANGULAR_SOURCE_LINK:${path.relative(root, full)}`);
    if (entry.isDirectory()) walkRegular(root, full, out);
    else if (entry.isFile()) out.push(full);
    else throw new Error(`ANGULAR_SOURCE_TYPE:${path.relative(root, full)}`);
  }
  return out;
}

const LOCK_KEYS = ['schema', 'created_at', 'angular', 'material', 'nx', 'web_codegen_scorer', 'licenses', 'members', 'aggregate_sha256'].sort().join('\0');

function readMirroredLock(root) {
  const lockPath = path.join(root, 'modules/pidex/angular/config/source-lock.json');
  const mirrorPath = path.join(root, 'skills/angular-application/references/upstream/UPSTREAM.json');
  if (!existsSync(lockPath) || !existsSync(mirrorPath)) throw new Error('ANGULAR_SOURCE_LOCK_MISSING');
  const lockBytes = readFileSync(lockPath); const mirrorBytes = readFileSync(mirrorPath);
  if (!lockBytes.equals(mirrorBytes)) throw new Error('ANGULAR_SOURCE_LOCK_MIRROR_MISMATCH');
  return JSON.parse(lockBytes.toString('utf8'));
}

function validateLockHeader(lock) {
  if (lock.schema !== 'pidex-angular-source-lock-v1' || !Array.isArray(lock.members) || lock.licenses?.verified !== true) throw new Error('ANGULAR_SOURCE_LOCK_INVALID');
  if (Object.keys(lock).sort().join('\0') !== LOCK_KEYS) throw new Error('ANGULAR_SOURCE_LOCK_SHAPE');
}

function validateMemberShape(member) {
  if (!member || Object.keys(member).sort().join('\0') !== 'bytes\0path\0sha256') throw new Error('ANGULAR_SOURCE_MEMBER_INVALID');
  if (typeof member.path !== 'string' || !Number.isSafeInteger(member.bytes) || !/^[a-f0-9]{64}$/.test(member.sha256)) throw new Error('ANGULAR_SOURCE_MEMBER_INVALID');
  if (path.isAbsolute(member.path) || member.path.split('/').some((part) => part === '..' || part === '') || !member.path.startsWith('skills/angular-application/references/')) throw new Error('ANGULAR_SOURCE_MEMBER_PATH');
}

function verifyMember(root, skillRoot, member) {
  const target = path.resolve(root, member.path);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error(`ANGULAR_SOURCE_MEMBER_MISSING:${member.path}`);
  const physical = realpathSync(target);
  if (physical !== skillRoot && !physical.startsWith(`${skillRoot}${path.sep}`)) throw new Error(`ANGULAR_SOURCE_MEMBER_ESCAPE:${member.path}`);
  const bytes = readFileSync(physical);
  if (bytes.length !== member.bytes || sha256(bytes) !== member.sha256) throw new Error(`ANGULAR_SOURCE_MEMBER_DIGEST:${member.path}`);
}

function managedFiles(root) {
  const base = path.join(root, 'skills/angular-application/references');
  return ['official-angular', 'official-material', 'official-nx', 'upstream']
    .flatMap((name) => walkRegular(root, path.join(base, name)))
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .filter((file) => !file.endsWith('/UPSTREAM.json')).sort();
}

function verifyMemberClosure(root, lock) {
  const seen = new Set(); let previous = ''; const skillRoot = realpathSync(path.join(root, 'skills/angular-application'));
  for (const member of lock.members) {
    validateMemberShape(member);
    if (member.path <= previous || seen.has(member.path)) throw new Error('ANGULAR_SOURCE_MEMBER_ORDER');
    verifyMember(root, skillRoot, member); previous = member.path; seen.add(member.path);
  }
  if (managedFiles(root).join('\0') !== [...seen].sort().join('\0')) throw new Error('ANGULAR_SOURCE_MEMBER_SET');
}

export function verifyAngularSourceLock(options = {}) {
  const root = path.resolve(options.pidexRoot || angularModulePidexRoot());
  const lock = readMirroredLock(root);
  validateLockHeader(lock);
  verifyMemberClosure(root, lock);
  const nestedSkills = walkRegular(root, path.join(root, 'skills/angular-application/references')).some((file) => path.basename(file) === 'SKILL.md');
  if (nestedSkills) throw new Error('ANGULAR_SOURCE_NESTED_SKILL');
  if (sha256(Buffer.from(canonicalMembers(lock.members))) !== lock.aggregate_sha256) throw new Error('ANGULAR_SOURCE_AGGREGATE');
  return { schema: lock.schema, status: 'verified', members: lock.members.length, aggregate_sha256: lock.aggregate_sha256, coordinates: { angular: lock.angular, material: lock.material, nx: lock.nx } };
}
