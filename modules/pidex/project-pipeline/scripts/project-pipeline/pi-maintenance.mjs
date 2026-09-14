import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mkdirSync, lstatSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import path from 'node:path';
import { safeProjectId } from './registry.mjs';

const leases = new AsyncLocalStorage();

function directory(dir) {
  mkdirSync(dir, { recursive: true });
  if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw new Error('pi-maintenance-path-invalid');
}

export function maintenancePaths(pidexRoot, projectId) {
  const root = path.resolve(pidexRoot);
  const id = safeProjectId(projectId);
  const dir = path.join(root, 'state', 'project-pi-maintenance');
  return { dir, lock: path.join(dir, `${id}.lock`), receipt: path.join(dir, `${id}.json`) };
}

export function readMaintenanceReceipt(paths) {
  const st = lstatSync(paths.receipt, { throwIfNoEntry: false });
  if (!st) return undefined;
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size > 8192) throw new Error('pi-maintenance-receipt-invalid');
  const receipt = JSON.parse(readFileSync(paths.receipt, 'utf8'));
  if (path.basename(paths.receipt) !== `${safeProjectId(receipt.project_id)}.json` || !['in_progress', 'held', 'verified', 'failed_unchanged', 'rolled_back'].includes(receipt.status)) throw new Error('pi-maintenance-receipt-invalid');
  return receipt;
}

export function maintenanceSummary(pidexRoot, projectId) {
  try {
    const paths = maintenancePaths(pidexRoot, projectId);
    const dir = lstatSync(paths.dir, { throwIfNoEntry: false });
    if (!dir) return { status: 'none', execution_lock: 'absent' };
    if (!dir.isDirectory() || dir.isSymbolicLink()) return { status: 'unknown' };
    const receipt = readMaintenanceReceipt(paths);
    const result = { status: receipt?.status || 'none', execution_lock: lstatSync(paths.lock, { throwIfNoEntry: false }) ? 'present' : 'absent' };
    for (const key of ['before', 'after', 'target']) if (/^\d+\.\d+\.\d+$/.test(receipt?.[key] || '')) result[key] = receipt[key];
    return result;
  } catch { return { status: 'unknown' }; }
}

export function writeMaintenanceReceipt(paths, receipt) {
  // Unique, immutable journal entry plus atomically published current disposition.
  const projectId = safeProjectId(receipt.project_id);
  if (path.basename(paths.receipt) !== `${projectId}.json`) throw new Error('pi-maintenance-receipt-invalid');
  const text = `${JSON.stringify(receipt)}\n`;
  const entry = path.join(paths.dir, `${projectId}-${randomUUID()}.json`);
  const fd = openSync(entry, 'wx', 0o600);
  try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  const temp = `${paths.receipt}.${randomUUID()}.tmp`;
  const tf = openSync(temp, 'wx', 0o600);
  try { writeFileSync(tf, text); fsyncSync(tf); } finally { closeSync(tf); }
  renameSync(temp, paths.receipt);
  if (process.platform !== 'win32') {
    const dir = openSync(paths.dir, 'r');
    try { fsyncSync(dir); } finally { closeSync(dir); }
  }
}

// Shared by the whole async orchestrator, direct agent dispatch and maintenance.
// AsyncLocalStorage permits nested dispatch only within the owning execution.
// Unknown/dead owners are never automatically reclaimed.
export function withProjectPiLease(options, action, maintenance = false) {
  const paths = maintenancePaths(options.pidexRoot || process.cwd(), options.projectId);
  directory(path.dirname(paths.dir));
  directory(paths.dir);
  const inherited = leases.getStore();
  if (!maintenance && inherited?.active && inherited.key === paths.lock && !inherited.maintenance) return action();
  const token = JSON.stringify({ nonce: randomUUID(), pid: process.pid, project_id: options.projectId, maintenance, started_at: new Date().toISOString() });
  let fd;
  try { fd = openSync(paths.lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('project-execution-busy'); throw error; }
  let owner;
  try { writeFileSync(fd, token); fsyncSync(fd); owner = lstatSync(paths.lock); }
  finally { closeSync(fd); }
  const lease = { key: paths.lock, maintenance, active: true };
  const release = () => {
    lease.active = false;
    if (paths.retainLock) return; // Unconfirmed disposition publication: manual inspection only.
    const current = lstatSync(paths.lock, { throwIfNoEntry: false });
    if (current?.isFile() && !current.isSymbolicLink() && current.nlink === 1 && current.dev === owner.dev && current.ino === owner.ino && readFileSync(paths.lock, 'utf8') === token) unlinkSync(paths.lock);
  };
  try {
    const receipt = readMaintenanceReceipt(paths);
    if (receipt && ['held', 'in_progress'].includes(receipt.status)) throw new Error('pi-maintenance-held');
    const result = leases.run(lease, () => action(paths));
    if (result && typeof result.then === 'function') return Promise.resolve(result).finally(release);
    release();
    return result;
  } catch (error) { release(); throw error; }
}
