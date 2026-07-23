import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

function safeSegment(value, max = 64) {
  return String(value || 'project').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'project';
}

export function canonicalProjectIdentity(project) {
  if (!project) throw new Error('REVIEW_CANONICAL_PROJECT_UNAVAILABLE');
  let canonicalProject;
  try { canonicalProject = realpathSync.native(path.resolve(project)); if (!lstatSync(canonicalProject).isDirectory()) throw new Error('not-directory'); }
  catch { throw new Error('REVIEW_CANONICAL_PROJECT_UNAVAILABLE'); }
  const digest = createHash('sha256').update(Buffer.from(canonicalProject, 'utf8')).digest('hex').slice(0, 12);
  return {
    canonicalProject,
    projectKey: `${safeSegment(path.basename(canonicalProject))}-${digest}`,
  };
}

export function projectPlanSelectionLock(stateDir, projectKey, planId) {
  if (!stateDir || !projectKey || !planId) throw new Error('invalid project selection lock');
  return path.join(path.resolve(stateDir), 'pipeline-events', `.selection-${safeSegment(projectKey, 80)}-${safeSegment(planId, 80)}.lock`);
}
