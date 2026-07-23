import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveArchiveRoot } from './archive-sync.mjs';
import { loadProjectRecord, safeProjectId } from './registry.mjs';

function canonicalDirectory(value, code) {
  try { const canonical = realpathSync.native(path.resolve(value)); if (!lstatSync(canonical).isDirectory()) throw new Error('not-directory'); return canonical; }
  catch { throw new Error(code); }
}

export function resolveProjectPipelineAuthority(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectId = safeProjectId(options.projectId);
  const record = loadProjectRecord(pidexRoot, projectId);
  if (record.project_id !== projectId) throw new Error('PROJECT_PIPELINE_AUTHORITY_INVALID');

  let declaredRoot;
  let kind;
  if (record.source?.kind === 'host-path') {
    if (!record.source.ref || !path.isAbsolute(record.source.ref)) throw new Error('PROJECT_PIPELINE_AUTHORITY_INVALID');
    declaredRoot = record.source.ref;
    kind = 'host-path';
  } else {
    const expected = resolveArchiveRoot({ pidexRoot, projectId });
    const registeredArchive = record.archive?.path || expected;
    if (!path.isAbsolute(registeredArchive)) throw new Error('PROJECT_PIPELINE_AUTHORITY_INVALID');
    declaredRoot = path.resolve(registeredArchive);
    if (declaredRoot !== expected) throw new Error('PROJECT_PIPELINE_AUTHORITY_INVALID');
    kind = 'archive';
  }

  const projectRoot = canonicalDirectory(declaredRoot, 'PROJECT_PIPELINE_AUTHORITY_UNAVAILABLE');
  return { projectId, projectRoot, kind, record };
}
