import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const ALLOWED_RULE_KEYS = new Set(['id', 'agent', 'phases', 'path', 'authority', 'summary', 'audience_scope', 'applies_when']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeBehavior(bytes) {
  return String(bytes).replaceAll('\r\n', '\n').replace(/[ \t]+$/gm, '').trimEnd() + '\n';
}

function relative(root, file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function isWithin(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function matchingFiles(root, matches, includeLinks = false) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return matchingFiles(file, matches, includeLinks);
    if (entry.isFile() && matches(entry.name)) return [file];
    return includeLinks && entry.isSymbolicLink() ? [file] : [];
  }).sort();
}

function markdownFiles(root) {
  return matchingFiles(root, (name) => name.endsWith('.md'), true);
}

function manifestFiles(root) {
  return matchingFiles(path.join(root, 'modules', 'pidex'), (name) => name === 'module.json');
}

function diagnostic(diagnostics, code, file, detail = '') {
  diagnostics.push({ code, path: file.replaceAll(path.sep, '/'), detail });
}

function isCanonicalCandidate(relativePath) {
  return /^agents\/pidex-[^/]+\.md$/.test(relativePath)
    || /^rules\/.+\.md$/.test(relativePath)
    || /^pidex\/rules\/[^/]+\.md$/.test(relativePath)
    || /^modules\/pidex\/[^/]+\/module\.json$/.test(relativePath)
    || /^modules\/pidex\/[^/]+\/rules\/.+\.md$/.test(relativePath);
}

function trackedCanonicalPaths(root, suppliedPaths, diagnostics) {
  let paths = suppliedPaths;
  if (paths === undefined) {
    try {
      paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    } catch (error) {
      diagnostic(diagnostics, 'git_inventory_unavailable', '.', error.code || 'git_ls_files_failed');
      return new Set();
    }
  }
  if (!Array.isArray(paths)) {
    diagnostic(diagnostics, 'git_inventory_unavailable', '.', 'invalid_git_tracked_paths');
    return new Set();
  }
  const normalized = paths.filter((value) => typeof value === 'string').map((value) => value.replaceAll('\\', '/'));
  for (const candidate of normalized) {
    const canonicalFamily = /^(agents\/pidex-[^/]+\.md|rules\/.+\.md|pidex\/rules\/[^/]+\.md|modules\/pidex\/[^/]+\/(?:module\.json|rules\/.+\.md))$/i.test(candidate);
    if (canonicalFamily && !isCanonicalCandidate(candidate)) diagnostic(diagnostics, 'noncanonical_case', candidate, 'canonical source path casing required');
  }
  return new Set(normalized.filter(isCanonicalCandidate));
}

function sourceIdentity(root, file) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) throw Object.assign(new Error('symlink source is not allowed'), { code: 'path_escape' });
  if (!stat.isFile()) throw Object.assign(new Error('source is not a regular file'), { code: 'unsupported_source' });
  const canonical = realpathSync(file);
  if (!isWithin(realpathSync(root), canonical)) throw Object.assign(new Error('source resolves outside canonical root'), { code: 'path_escape' });
  return { dev: stat.dev, ino: stat.ino, canonical };
}

function sameSourceIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino && left.canonical === right.canonical; }

function readStableSource(root, file, operationHook) {
  const initial = sourceIdentity(root, file);
  operationHook?.({ phase: 'before-source-read', file, relative_path: relative(root, file) });
  let beforeRead;
  try { beforeRead = sourceIdentity(root, file); } catch { throw Object.assign(new Error('source identity changed before read'), { code: 'source_identity_changed' }); }
  if (!sameSourceIdentity(initial, beforeRead)) throw Object.assign(new Error('source identity changed before read'), { code: 'source_identity_changed' });
  const bytes = readFileSync(file, 'utf8');
  let afterRead;
  try { afterRead = sourceIdentity(root, file); } catch { throw Object.assign(new Error('source identity changed during read'), { code: 'source_identity_changed' }); }
  if (!sameSourceIdentity(beforeRead, afterRead)) throw Object.assign(new Error('source identity changed during read'), { code: 'source_identity_changed' });
  return bytes;
}

function sourceDescriptor(root, file, ruleId, sourceKind, diagnostics, operationHook) {
  try {
    const behavior = normalizeBehavior(readStableSource(root, file, operationHook));
    return {
      rule_id: ruleId,
      version_hash: sha256(behavior),
      source: relative(root, file),
      source_kind: sourceKind,
      provenance: 'unmanaged',
      owner: 'canonical',
      scope: sourceKind === 'project' ? 'project' : 'global',
      protected_class: 'unknown',
      impact_contract_ref: null,
      capabilities: [],
      lifecycle_state: 'active',
    };
  } catch (error) {
    const code = ['path_escape', 'unsupported_source', 'source_identity_changed'].includes(error.code) ? error.code : 'unreadable_source';
    diagnostic(diagnostics, code, relative(root, file), code === 'unreadable_source' ? (error.code || 'read_failed') : error.message);
    return undefined;
  }
}

function canonicalRuleId(relativePath, kind) {
  const basename = path.basename(relativePath, '.md');
  if (kind === 'agent' || kind === 'project') return `rule:agent:${basename}`;
  return `rule:${kind}:${relativePath.replace(/\.md$/, '').replaceAll('/', ':')}`;
}

function normalizedDeclaredPath(declaredPath) {
  if (typeof declaredPath !== 'string' || !declaredPath || path.isAbsolute(declaredPath) || path.win32.isAbsolute(declaredPath)) return undefined;
  const normalized = declaredPath.replaceAll('\\', '/');
  const segments = normalized.split('/');
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  if (!normalized.endsWith('.md') || segments.some((segment) => !segment || segment === '.' || segment === '..' || reserved.test(segment) || /[. ]$/.test(segment))) return undefined;
  return normalized;
}

function existingDeclaredTarget(moduleRoot, normalized) {
  const target = path.resolve(moduleRoot, normalized);
  return isWithin(moduleRoot, target) && existsSync(target) ? target : undefined;
}

function isSafeDeclaredTarget(moduleRoot, target) {
  try {
    return !lstatSync(target).isSymbolicLink() && isWithin(realpathSync(moduleRoot), realpathSync(target));
  } catch {
    return false;
  }
}

function validateDeclaredPath(moduleRoot, declaredPath, root, diagnostics, manifestPath, index) {
  const normalized = normalizedDeclaredPath(declaredPath);
  if (!normalized) {
    diagnostic(diagnostics, 'path_escape', relative(root, manifestPath), `agent_rules[${index}].path`);
    return undefined;
  }
  const target = existingDeclaredTarget(moduleRoot, normalized);
  if (!target) {
    diagnostic(diagnostics, 'module_rule_missing', relative(root, manifestPath), `agent_rules[${index}].path=${normalized}`);
    return undefined;
  }
  if (!isSafeDeclaredTarget(moduleRoot, target)) {
    diagnostic(diagnostics, 'path_escape', relative(root, target));
    return undefined;
  }
  return target;
}

function addDescriptor(root, file, ruleId, kind, descriptors, diagnostics, operationHook) {
  const descriptor = sourceDescriptor(root, file, ruleId, kind, diagnostics, operationHook);
  if (descriptor) descriptors.push(descriptor);
}

function addSourceFiles(files, root, kind, discoveredCandidates, descriptors, diagnostics, operationHook) {
  for (const file of files) {
    const rel = relative(root, file);
    discoveredCandidates.add(rel);
    addDescriptor(root, file, canonicalRuleId(rel, kind), kind, descriptors, diagnostics, operationHook);
  }
}

function collectRootSources(root, projectRoot, discoveredCandidates, descriptors, diagnostics, operationHook) {
  const agents = markdownFiles(path.join(root, 'agents')).filter((file) => /^agents\/pidex-[^/]+\.md$/.test(relative(root, file)));
  addSourceFiles(agents, root, 'agent', discoveredCandidates, descriptors, diagnostics, operationHook);
  addSourceFiles(markdownFiles(path.join(root, 'rules')), root, 'root', discoveredCandidates, descriptors, diagnostics, operationHook);
  addSourceFiles(markdownFiles(path.join(projectRoot, 'pidex', 'rules')), root, 'project', discoveredCandidates, descriptors, diagnostics, operationHook);
}

function readManifest(root, manifestPath, diagnostics) {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    diagnostic(diagnostics, 'invalid_manifest', relative(root, manifestPath), error.message);
    return undefined;
  }
}

function reportUnknownItemKeys(rule, root, manifestPath, index, diagnostics) {
  for (const key of Object.keys(rule)) {
    if (!ALLOWED_RULE_KEYS.has(key)) diagnostic(diagnostics, 'unknown_item_key', relative(root, manifestPath), `agent_rules[${index}].${key}`);
  }
}

function isRuleObject(rule) {
  return Boolean(rule) && typeof rule === 'object' && !Array.isArray(rule);
}

function hasRuleId(rule) {
  return typeof rule.id === 'string' && Boolean(rule.id);
}

function addDeclaredRule(rule, index, moduleRoot, root, manifestPath, declared, descriptors, diagnostics, operationHook) {
  if (!isRuleObject(rule)) {
    diagnostic(diagnostics, 'invalid_item', relative(root, manifestPath), `agent_rules[${index}]`);
    return;
  }
  reportUnknownItemKeys(rule, root, manifestPath, index, diagnostics);
  if (!hasRuleId(rule)) {
    diagnostic(diagnostics, 'invalid_item', relative(root, manifestPath), `agent_rules[${index}].id`);
    return;
  }
  const file = validateDeclaredPath(moduleRoot, rule.path, root, diagnostics, manifestPath, index);
  if (!file) return;
  const normalized = relative(moduleRoot, file);
  if (declared.has(normalized)) diagnostic(diagnostics, 'duplicate_path', relative(root, manifestPath), normalized);
  declared.set(normalized, rule.id);
  addDescriptor(root, file, `rule:module:${rule.id}`, 'module', descriptors, diagnostics, operationHook);
}

function reportModuleRuleOrphans(moduleRoot, root, manifestPath, declared, discoveredCandidates, diagnostics) {
  for (const file of markdownFiles(path.join(moduleRoot, 'rules'))) {
    discoveredCandidates.add(relative(root, file));
    const normalized = relative(moduleRoot, file);
    if (lstatSync(file).isSymbolicLink()) {
      diagnostic(diagnostics, 'path_escape', relative(root, file), 'symlink source is not allowed');
    } else if (!declared.has(normalized)) {
      diagnostic(diagnostics, 'module_rule_orphan', relative(root, file));
    }
  }
}

function collectManifestDescriptors(manifestPath, root, discoveredCandidates, descriptors, diagnostics, operationHook) {
  discoveredCandidates.add(relative(root, manifestPath));
  const manifest = readManifest(root, manifestPath, diagnostics);
  const rules = manifest?.agent_rules;
  if (!Array.isArray(rules)) return;
  const moduleRoot = path.dirname(manifestPath);
  const declared = new Map();
  for (let index = 0; index < rules.length; index += 1) {
    addDeclaredRule(rules[index], index, moduleRoot, root, manifestPath, declared, descriptors, diagnostics, operationHook);
  }
  reportModuleRuleOrphans(moduleRoot, root, manifestPath, declared, discoveredCandidates, diagnostics);
}

function collectModuleSources(root, discoveredCandidates, descriptors, diagnostics, operationHook) {
  for (const manifestPath of manifestFiles(root)) {
    collectManifestDescriptors(manifestPath, root, discoveredCandidates, descriptors, diagnostics, operationHook);
  }
}

function reportCandidateMismatch(discoveredCandidates, tracked, diagnostics) {
  for (const candidate of discoveredCandidates) {
    if (!tracked.has(candidate)) diagnostic(diagnostics, 'untracked_source', candidate);
  }
  for (const candidate of tracked) {
    if (!discoveredCandidates.has(candidate)) diagnostic(diagnostics, 'tracked_source_missing', candidate);
  }
}

function mergeDescriptor(entriesById, descriptor, diagnostics) {
  const existing = entriesById.get(descriptor.rule_id);
  if (!existing) {
    entriesById.set(descriptor.rule_id, { ...descriptor, provenance_references: [descriptor.source] });
    return;
  }
  if (existing.source_kind === 'module' || descriptor.source_kind === 'module') {
    diagnostic(diagnostics, 'duplicate_rule_id', descriptor.source, descriptor.rule_id);
    return;
  }
  if (existing.version_hash !== descriptor.version_hash) {
    diagnostic(diagnostics, 'conflicting_provenance', descriptor.source, descriptor.rule_id);
    return;
  }
  existing.provenance_references.push(descriptor.source);
}

function mergeDescriptors(descriptors, diagnostics) {
  const entriesById = new Map();
  for (const descriptor of descriptors) mergeDescriptor(entriesById, descriptor, diagnostics);
  return [...entriesById.values()].sort((a, b) => a.rule_id.localeCompare(b.rule_id));
}

function canonicalEntries(entries) {
  return JSON.stringify(entries.map((entry) => ({ ...entry, provenance_references: [...entry.provenance_references].sort() })));
}

/** Reconciles read-only canonical sources; it never edits source files or grants capabilities. */
export function reconcileRuleInventory({ root, projectRoot = root, gitTrackedPaths, operationHook } = {}) {
  const absoluteRoot = path.resolve(root || '.');
  const diagnostics = [];
  const tracked = trackedCanonicalPaths(absoluteRoot, gitTrackedPaths, diagnostics);
  const discoveredCandidates = new Set();
  const descriptors = [];
  collectRootSources(absoluteRoot, projectRoot, discoveredCandidates, descriptors, diagnostics, operationHook);
  collectModuleSources(absoluteRoot, discoveredCandidates, descriptors, diagnostics, operationHook);
  reportCandidateMismatch(discoveredCandidates, tracked, diagnostics);
  const entries = mergeDescriptors(descriptors, diagnostics);
  const canonical = canonicalEntries(entries);
  return {
    complete: diagnostics.length === 0,
    diagnostics: diagnostics.sort((a, b) => `${a.code}\0${a.path}\0${a.detail}`.localeCompare(`${b.code}\0${b.path}\0${b.detail}`)),
    entries,
    inventory_count: entries.length,
    inventory_digest: sha256(canonical),
    reconciliation_revision: sha256(canonical),
  };
}
