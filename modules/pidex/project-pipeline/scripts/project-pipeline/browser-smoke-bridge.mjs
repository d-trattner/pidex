import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_SMOKE_STATUS } from '../../../browser-smoke/scripts/browser-smoke/status.mjs';
import { validateBrowserSmokeRequest } from '../../../browser-smoke/scripts/browser-smoke/request-schema.mjs';
import { runBrowserSmokeCheck } from '../../../browser-smoke/scripts/browser-smoke/check.mjs';
import { browserSmokePaths } from '../../../browser-smoke/scripts/browser-smoke/paths.mjs';
import { validateBrowserSmokeResult } from '../../../browser-smoke/scripts/browser-smoke/result-contract.mjs';
import { acquireProjectArchiveLock, assertTrustedDirectory, normalizeRel, pathWithin, removeOwnedDirectory, resolveArchiveRoot, trustedDirectoryIdentity, validateBrowserEvidenceBundle } from './archive-sync.mjs';
import { loadProjectRecord, safeProjectId } from './registry.mjs';

const REQUESTER_BY_ARCHIVE_SEGMENT = Object.freeze({ qa: 'pidex-qa', uat: 'pidex-uat', devops: 'pidex-devops' });
const DEVOPS_ALLOWED_CHECKS = new Set(['url', 'console']);

function blocked(reason, detail) {
  return { ok: false, status: BROWSER_SMOKE_STATUS.BLOCKED_INFRA, status_reason: reason, detail };
}

function readStableRequestJson(file, archiveRoot, maxBytes = 256 * 1024) {
  const rootIdentity = trustedDirectoryIdentity(archiveRoot);
  const rel = path.relative(rootIdentity.path, path.resolve(file));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('request outside archive');
  const parentIdentities = [];
  let current = rootIdentity.path;
  for (const part of rel.split(path.sep).slice(0, -1)) {
    if (!part || part === '.' || part === '..') throw new Error('unsafe request path');
    current = path.join(current, part);
    parentIdentities.push(trustedDirectoryIdentity(current));
  }
  const before = lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maxBytes || (before.mode & 0o111) !== 0) throw new Error('unsafe request file');
  let fd;
  try {
    fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.size > maxBytes || (opened.mode & 0o111) !== 0) throw new Error('request file changed');
    const content = readFileSync(fd);
    const after = fstatSync(fd);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || content.length !== after.size) throw new Error('request file changed');
    assertTrustedDirectory(rootIdentity);
    for (const identity of parentIdentities) assertTrustedDirectory(identity);
    return JSON.parse(content.toString('utf8'));
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function browserSmokeBridgeRoot(pidexRoot, projectId) {
  const archiveRoot = resolveArchiveRoot({ pidexRoot, projectId: safeProjectId(projectId) });
  return path.join(archiveRoot, 'browser-smoke');
}

export function browserSmokeResultDir(pidexRoot, projectId, requestId) {
  const root = browserSmokeBridgeRoot(pidexRoot, projectId);
  const target = path.join(root, String(requestId || ''));
  if (!pathWithin(root, target)) throw new Error('browser-smoke result path escapes bridge root');
  return target;
}

export function classifyBrowserSmokeRequestPath(archiveRoot, requestPath) {
  const file = path.resolve(requestPath);
  if (!pathWithin(archiveRoot, file)) return blocked('request-path-escape', 'request path outside archive root');
  const rel = normalizeRel(path.relative(archiveRoot, file));
  const parts = rel.split('/');
  if (parts[0] !== 'agents.output') return blocked('request-path-invalid', 'request must be under agents.output/**');
  const segment = parts[1];
  const requester = REQUESTER_BY_ARCHIVE_SEGMENT[segment];
  if (!requester) return blocked('requester-not-allowed', 'request path must be agents.output/qa|uat|devops/**');
  if (!parts.at(-1)?.endsWith('.json')) return blocked('request-path-invalid', 'request artifact must be json');
  return { ok: true, file, rel, requester };
}

export function previewUrlFromRecord(record, processName = 'preview') {
  const process = record?.preview?.processes?.[processName];
  if (!process?.operator_url) return blocked('preview-not-running', 'managed preview URL missing');
  if (process.status && process.status !== 'running') return blocked('preview-not-running', `managed preview status=${process.status}`);
  return { ok: true, url: process.operator_url, source: 'project-pipeline-registry', generation: record?.preview?.ports?.generation };
}

export function validateProjectPipelineBrowserSmokeRequest(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectId = safeProjectId(options.projectId);
  const archiveRoot = resolveArchiveRoot({ pidexRoot, projectId });
  const record = options.record || loadProjectRecord(pidexRoot, projectId);
  const registeredArchive = record?.archive?.path ? path.resolve(record.archive.path) : '';
  if (!registeredArchive || registeredArchive !== archiveRoot) return blocked('archive-root-mismatch', 'request archive root is not the registered project archive root');
  const pathInfo = classifyBrowserSmokeRequestPath(archiveRoot, options.requestPath || '');
  if (!pathInfo.ok) return pathInfo;
  let raw;
  try { raw = readStableRequestJson(pathInfo.file, archiveRoot); } catch { return blocked('invalid-request', 'request json unreadable or unsafe'); }
  const generic = validateBrowserSmokeRequest(raw);
  if (!generic.ok) return raw?.schema === 2 ? { ...generic, request_schema: 2 } : generic;
  const request = generic.request;
  if (request.project_id !== projectId) return request.schema === 2 ? { ...blocked('project-id-mismatch', 'request project_id does not match registry project'), request_schema: 2 } : blocked('project-id-mismatch', 'request project_id does not match registry project');
  if (request.requester !== pathInfo.requester) return request.schema === 2 ? { ...blocked('requester-path-mismatch', 'requester does not match agents.output path'), request_schema: 2 } : blocked('requester-path-mismatch', 'requester does not match agents.output path');
  if (request.schema === 1 && request.requester === 'pidex-devops' && request.checks.some((check) => !DEVOPS_ALLOWED_CHECKS.has(check.type))) return blocked('devops-check-not-allowed', 'pidex-devops may request reachability/status checks only');
  const nowMs = options.now ? Date.parse(options.now) : Date.now();
  const createdMs = Date.parse(request.created_at);
  const maxAgeMs = Number.isInteger(options.maxAgeMs) ? options.maxAgeMs : 24 * 60 * 60 * 1000;
  if (!Number.isFinite(nowMs) || Math.abs(nowMs - createdMs) > maxAgeMs) return request.schema === 2 ? { ...blocked('stale-request', 'request timestamp is outside accepted freshness window'), request_schema: 2 } : blocked('stale-request', 'request timestamp is outside accepted freshness window');
  const resultDir = browserSmokeResultDir(pidexRoot, projectId, request.request_id);
  if (existsSync(resultDir)) return request.schema === 2 ? { ...blocked('duplicate-request', 'browser-smoke result directory already exists'), request_schema: 2 } : blocked('duplicate-request', 'browser-smoke result directory already exists');
  const preview = previewUrlFromRecord(record, request.preview.process);
  if (!preview.ok) return request.schema === 2 ? { ...preview, request_schema: 2 } : preview;
  return { ok: true, request, request_schema: request.schema, request_file: pathInfo.file, request_rel: pathInfo.rel, archive_root: archiveRoot, result_dir: resultDir, preview_url: preview.url, preview_url_source: preview.source, preview_generation: preview.generation };
}

export function reserveBrowserSmokeResultDir(resultDir) {
  mkdirSync(path.dirname(resultDir), { recursive: true });
  mkdirSync(resultDir, { recursive: false, mode: 0o700 });
  return resultDir;
}

export async function runProjectPipelineBrowserSmokeRequest(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectId = safeProjectId(options.projectId);
  const validated = validateProjectPipelineBrowserSmokeRequest({
    pidexRoot,
    projectId,
    requestPath: options.requestPath,
    record: options.record,
    now: options.now,
    maxAgeMs: options.maxAgeMs,
  });
  if (!validated.ok) return validated;
  let stageIdentity;
  try {
    const stageParent = trustedDirectoryIdentity(path.dirname(validated.archive_root));
    const stageRoot = mkdtempSync(path.join(stageParent.path, `.${path.basename(validated.archive_root)}.browser-smoke-runner-`));
    stageIdentity = trustedDirectoryIdentity(stageRoot);
    const outputDir = path.join(stageRoot, validated.request.request_id);
    mkdirSync(outputDir, { recursive: true, mode: 0o700 });
    const runner = options.browserSmokeRunner || runBrowserSmokeCheck;
    const runtime = browserSmokePaths(pidexRoot);
    const result = await runner({
      url: validated.preview_url,
      requestPath: validated.request_file,
      outputDir,
      outputRoot: stageRoot,
      project: runtime.stateDir,
      stateDir: runtime.stateDir,
      browsersPath: runtime.cacheDir,
      playwright: options.playwright,
      previewUrlSource: validated.preview_url_source,
    });
    if (validated.request.schema === 2) {
      const resultFile = path.join(outputDir, 'browser-smoke-result.json');
      const publishedResult = JSON.parse(readFileSync(resultFile, 'utf8'));
      if (!validateBrowserSmokeResult(result, validated.request).ok || !validateBrowserSmokeResult(publishedResult, validated.request).ok || JSON.stringify(result) !== JSON.stringify(publishedResult)) throw new Error('invalid browser result');
      const expectedFiles = new Set(['browser-smoke-result.json', ...publishedResult.viewports.flatMap((viewport) => viewport.screenshot ? [viewport.screenshot] : [])]);
      const actualFiles = readdirSync(outputDir).sort();
      if (actualFiles.length !== expectedFiles.size || actualFiles.some((name) => !expectedFiles.has(name))) throw new Error('schema2 evidence inventory invalid');
    }
    validateBrowserEvidenceBundle(outputDir, validated.request.request_id);
    const lock = acquireProjectArchiveLock({ pidexRoot, projectId, operation: 'browser-publish', lockTimeoutMs: options.lockTimeoutMs });
    if (!lock.ok) return validated.request.schema === 2 ? { ...blocked('archive-lock-unavailable', 'browser evidence archive is busy'), request_schema: 2 } : blocked('archive-lock-unavailable', 'browser evidence archive is busy');
    try {
      const archiveIdentity = trustedDirectoryIdentity(validated.archive_root);
      if (existsSync(validated.result_dir)) return validated.request.schema === 2 ? { ...blocked('duplicate-request', 'browser-smoke result directory already exists'), request_schema: 2 } : blocked('duplicate-request', 'browser-smoke result directory already exists');
      const browserRoot = path.dirname(validated.result_dir);
      const browserIdentity = trustedDirectoryIdentity(browserRoot, { create: true });
      assertTrustedDirectory(archiveIdentity);
      assertTrustedDirectory(browserIdentity);
      assertTrustedDirectory(stageIdentity);
      renameSync(outputDir, validated.result_dir);
      assertTrustedDirectory(archiveIdentity);
      assertTrustedDirectory(browserIdentity);
      validateBrowserEvidenceBundle(validated.result_dir, validated.request.request_id);
    } finally {
      lock.release();
    }
    return {
      ok: result?.ok === true,
      status: result?.status,
      status_reason: result?.status_reason,
      request_id: validated.request.request_id,
      request_file: validated.request_file,
      request_rel: validated.request_rel,
      result_dir: validated.result_dir,
      result_file: path.join(validated.result_dir, 'browser-smoke-result.json'),
      preview_url: validated.preview_url,
      preview_url_source: validated.preview_url_source,
      preview_generation: validated.preview_generation,
      result,
      request_schema: validated.request.schema,
    };
  } catch {
    return validated.request.schema === 2 ? { ...blocked('evidence-publication-failed', 'browser evidence publication failed'), request_schema: 2 } : blocked('evidence-publication-failed', 'browser evidence publication failed');
  } finally {
    if (stageIdentity) { try { removeOwnedDirectory(stageIdentity); } catch {} }
  }
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--request') out.requestPath = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: browser-smoke-bridge.mjs --project-id ID --request ARCHIVE_REQUEST_JSON --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.projectId || !args.requestPath) throw new Error('--project-id and --request are required');
    const result = await runProjectPipelineBrowserSmokeRequest(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.status || (result.ok ? 'ok' : 'failed')}: ${result.status_reason || result.result_file || ''}`);
    process.exit(result.ok === true ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
