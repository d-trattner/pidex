import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createRuleDescriptor } from './rule-identity.mjs';
import { verifyBundledBaseline } from './rule-lifecycle.mjs';

const ALLOWED_RULE_KEYS = new Set(['id', 'agent', 'phases', 'path', 'authority', 'summary', 'audience_scope', 'applies_when']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function gitObjectAuthority(root, operationHook) {
  try {
    const invoke = (args) => execFileSync('git', args, { cwd: root, encoding: 'buffer' });
    const assertCleanAuthorityPaths = () => {
      const records = invoke(['status', '--porcelain=v1', '-z', '--untracked-files=all']).toString('utf8').split('\0');
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (!record) continue;
        const status = record.slice(0, 2); const paths = [record.slice(3)];
        if ((status[0] === 'R' || status[0] === 'C') && records[index + 1]) paths.push(records[++index]);
        if (paths.some(isCanonicalCandidate)) throw Object.assign(new Error(`Git authority path is dirty: ${paths.find(isCanonicalCandidate)}`), { code: 'source_unavailable' });
      }
    };
    const canonicalRoot = realpathSync(root);
    const gitRoot = invoke(['rev-parse', '--show-toplevel']).toString('utf8').trim();
    if (realpathSync(gitRoot) !== canonicalRoot) throw new Error('noncanonical_git_root');
    const head = invoke(['rev-parse', '--verify', 'HEAD^{commit}']).toString('utf8').trim();
    if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('invalid_git_head');
    assertCleanAuthorityPaths();
    const tree = invoke(['ls-tree', '-rz', '--name-only', 'HEAD']).toString('utf8').split('\0').filter(Boolean);
    return Object.freeze({
      has(relativePath) { return tree.includes(relativePath); },
      read(relativePath) {
        if (!tree.includes(relativePath)) throw Object.assign(new Error('source not tracked at HEAD'), { code: 'source_unavailable' });
        operationHook?.({ phase: 'before-git-object-read', relative_path: relativePath });
        const before = invoke(['rev-parse', '--verify', 'HEAD^{commit}']).toString('utf8').trim();
        if (before !== head) throw Object.assign(new Error('HEAD moved before object read'), { code: 'source_head_moved' });
        assertCleanAuthorityPaths();
        const bytes = invoke(['show', `${head}:${relativePath}`]).toString('utf8');
        assertCleanAuthorityPaths();
        const after = invoke(['rev-parse', '--verify', 'HEAD^{commit}']).toString('utf8').trim();
        if (after !== head) throw Object.assign(new Error('HEAD moved during object read'), { code: 'source_head_moved' });
        return { bytes, authority: Object.freeze({ kind: 'git_head', verified: true, head, tree_digest: sha256(tree.join('\0')) }) };
      },
    });
  } catch (error) {
    return Object.freeze({ read() { throw Object.assign(new Error('canonical Git authority unavailable'), { code: error.code === 'source_head_moved' ? error.code : 'source_unavailable' }); } });
  }
}

function packagedAuthority(root) {
  let baseline;
  try { baseline = verifyBundledBaseline({ root }); } catch { return Object.freeze({ read() { throw Object.assign(new Error('verified packaged baseline unavailable'), { code: 'source_unavailable' }); } }); }
  const members = new Map(baseline.members.map((member) => [member.path, member]));
  return Object.freeze({
    has(relativePath) { return members.has(relativePath); },
    read(relativePath) {
      const member = members.get(relativePath);
      if (!member) throw Object.assign(new Error('source absent from packaged baseline'), { code: 'source_unavailable' });
      const bytes = readFileSync(path.join(root, ...relativePath.split('/')), 'utf8');
      if (sha256(bytes) !== member.byte_hash) throw Object.assign(new Error('packaged baseline member digest mismatch'), { code: 'source_unavailable' });
      return { bytes, authority: Object.freeze({ kind: 'packaged_baseline', verified: true, head: baseline.baseline_parent_commit, manifest_digest: baseline.aggregate_digest }) };
    },
  });
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

function isManagedMirrorPath(relativePath) { return /^pidex\/rules\/managed(?:\/|$)/.test(relativePath); }

function isCanonicalCandidate(relativePath) {
  return /^agents\/pidex-[^/]+\.md$/.test(relativePath)
    || /^rules\/.+\.md$/.test(relativePath)
    || (!isManagedMirrorPath(relativePath) && /^pidex\/rules\/.+\.md$/.test(relativePath))
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

function sourceDescriptor(root, file, legacyRuleId, sourceKind, diagnostics, operationHook, projectScopeId, routing = {}, authorityReader) {
  try {
    const source = relative(root, file);
    const sourceInput = authorityReader ? authorityReader.read(source) : { bytes: readStableSource(root, file, operationHook), authority: undefined };
    const behavior = normalizeBehavior(sourceInput.bytes);
    const parts = sourceKind === 'agent'
      ? { agent: path.basename(source, '.md'), slug: 'legacy-aggregate' }
      : sourceKind === 'root'
        ? { agent: path.basename(path.dirname(source)).startsWith('pidex-') ? path.basename(path.dirname(source)) : `pidex-${path.basename(path.dirname(source))}`, slug: path.basename(source, '.md') }
        : sourceKind === 'project'
          ? { agent: path.basename(source, '.md').startsWith('pidex-') ? path.basename(source, '.md') : 'pidex-project', slug: 'legacy-aggregate' }
          : { agent: typeof routing.agent === 'string' ? routing.agent : 'pidex-module', slug: legacyRuleId.slice('rule:module:'.length).replaceAll('.', '-').replace(/[^a-z0-9-]/g, '-').slice(-80) };
    if (!/^pidex-[a-z0-9-]+$/.test(parts.agent) || !/^[a-z0-9-]+$/.test(parts.slug) || (sourceKind === 'project' && !/^[a-f0-9]{24,64}$/.test(projectScopeId))) throw Object.assign(new Error('legacy source identity is unavailable'), { code: 'legacy_identity_invalid' });
    const content_hash = sha256(behavior);
    const scope_id = sourceKind === 'project' ? projectScopeId : null;
    const rule_id = scope_id ? `project:${scope_id}:${parts.agent}:${parts.slug}` : `pidex-global:${parts.agent}:${parts.slug}`;
    const commit = sha256(`${legacyRuleId}\0${content_hash}`).slice(0, 40);
    const descriptor = createRuleDescriptor({
      rule_id, legacy_aliases: [legacyRuleId], tier: scope_id ? 'project' : 'global', scope_id, agent: parts.agent, slug: parts.slug, owner: 'legacy_baseline', applicability: [], protection_class: 'legacy_baseline', action_policy: 'pinned', lifecycle_state: 'active', content_hash,
      provenance_digest: sha256(`legacy:${legacyRuleId}`), admission_policy_version: 'legacy-v1', admission_digest: sha256(`legacy-admission:${legacyRuleId}`), transaction_digest: sha256(`legacy-transaction:${legacyRuleId}`), predecessor_commit: commit, accepted_commit: commit, source_kind: `legacy_${sourceKind}`, rule_version: content_hash, project_override_policy: 'forbidden', overrides_rule_id: null,
    });
    const phases = sourceKind === 'module' && Array.isArray(routing.phases) && routing.phases.every((value) => typeof value === 'string' && value) ? [...new Set(routing.phases)].sort() : [];
    const applicability = sourceKind === 'module' && Array.isArray(routing.applies_when) && routing.applies_when.every((value) => typeof value === 'string' && value) ? [...new Set(routing.applies_when)].sort() : [];
    return { rule_id: descriptor.rule_id, version_hash: descriptor.rule_version, source, source_kind: descriptor.source_kind, provenance: 'legacy_adapter', owner: descriptor.owner, scope: descriptor.tier, protected_class: descriptor.protection_class, impact_contract_ref: null, capabilities: [], lifecycle_state: descriptor.lifecycle_state, bytes: behavior, descriptor, source_authority: sourceInput.authority, agent: sourceKind === 'module' ? parts.agent : undefined, phases, applicability };
  } catch (error) {
    const code = ['path_escape', 'unsupported_source', 'source_identity_changed', 'source_head_moved', 'source_unavailable', 'legacy_identity_invalid'].includes(error.code) ? error.code : 'unreadable_source';
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

function addDescriptor(root, file, ruleId, kind, descriptors, diagnostics, operationHook, projectScopeId, routing, authorityReader) {
  const descriptor = sourceDescriptor(root, file, ruleId, kind, diagnostics, operationHook, projectScopeId, routing, authorityReader);
  if (descriptor) descriptors.push(descriptor);
}

function addSourceFiles(files, sourceRoot, kind, discoveredCandidates, descriptors, diagnostics, operationHook, projectScopeId, authorityReader) {
  for (const file of files) {
    const rel = relative(sourceRoot, file);
    discoveredCandidates.add(rel);
    addDescriptor(sourceRoot, file, canonicalRuleId(rel, kind), kind, descriptors, diagnostics, operationHook, projectScopeId, undefined, authorityReader);
  }
}

function authorityFiles(files, sourceRoot, authorityReader) {
  return authorityReader?.has ? files.filter((file) => authorityReader.has(relative(sourceRoot, file))) : files;
}

function collectRootSources(root, projectRoot, discoveredCandidates, descriptors, diagnostics, operationHook, projectScopeId, authority) {
  const agents = authorityFiles(markdownFiles(path.join(root, 'agents')).filter((file) => /^agents\/pidex-[^/]+\.md$/.test(relative(root, file))), root, authority?.packaged);
  addSourceFiles(agents, root, 'agent', discoveredCandidates, descriptors, diagnostics, operationHook, undefined, authority?.packaged);
  addSourceFiles(authorityFiles(markdownFiles(path.join(root, 'rules')), root, authority?.packaged), root, 'root', discoveredCandidates, descriptors, diagnostics, operationHook, undefined, authority?.packaged);
  // Managed project bytes enter only through immutable verified mirror adapters.
  addSourceFiles(authorityFiles(markdownFiles(path.join(projectRoot, 'pidex', 'rules')).filter((file) => !relative(projectRoot, file).startsWith('pidex/rules/managed/')), projectRoot, authority?.project), projectRoot, 'project', discoveredCandidates, descriptors, diagnostics, operationHook, projectScopeId, authority?.project);
}

function readManifest(root, manifestPath, diagnostics, authorityReader) {
  try {
    const source = authorityReader ? authorityReader.read(relative(root, manifestPath)).bytes : readFileSync(manifestPath, 'utf8');
    return JSON.parse(source);
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

function addDeclaredRule(rule, index, moduleRoot, root, manifestPath, declared, descriptors, diagnostics, operationHook, authorityReader) {
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
  // One trusted module file can apply to several agent/phase declarations.
  declared.set(normalized, rule.id);
  addDescriptor(root, file, `rule:module:${rule.id}`, 'module', descriptors, diagnostics, operationHook, undefined, rule, authorityReader);
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

function collectManifestDescriptors(manifestPath, root, discoveredCandidates, descriptors, diagnostics, operationHook, authorityReader) {
  discoveredCandidates.add(relative(root, manifestPath));
  const manifest = readManifest(root, manifestPath, diagnostics, authorityReader);
  const rules = manifest?.agent_rules;
  if (!Array.isArray(rules)) return;
  const moduleRoot = path.dirname(manifestPath);
  const declared = new Map();
  for (let index = 0; index < rules.length; index += 1) {
    addDeclaredRule(rules[index], index, moduleRoot, root, manifestPath, declared, descriptors, diagnostics, operationHook, authorityReader);
  }
  reportModuleRuleOrphans(moduleRoot, root, manifestPath, declared, discoveredCandidates, diagnostics);
}

function collectModuleSources(root, discoveredCandidates, descriptors, diagnostics, operationHook, authorityReader) {
  for (const manifestPath of authorityFiles(manifestFiles(root), root, authorityReader)) {
    collectManifestDescriptors(manifestPath, root, discoveredCandidates, descriptors, diagnostics, operationHook, authorityReader);
  }
}

function managedMirrorDescriptor(mirror, member) {
  if (!mirror || mirror.status !== 'verified' || typeof mirror.repository_identity !== 'string' || !mirror.repository_identity || !/^[a-f0-9]{40}$/.test(mirror.accepted_commit) || !member || typeof member.bytes !== 'string' || !member.descriptor || typeof member.descriptor !== 'object') return undefined;
  const { schema, ...input } = member.descriptor;
  let descriptor;
  try { descriptor = createRuleDescriptor(input); } catch { return undefined; }
  if (schema !== descriptor.schema || JSON.stringify(member.descriptor) !== JSON.stringify(descriptor) || descriptor.owner !== mirror.repository_identity || descriptor.accepted_commit !== mirror.accepted_commit || descriptor.content_hash !== sha256(normalizeBehavior(member.bytes)) || descriptor.rule_version !== descriptor.content_hash) return undefined;
  const global = descriptor.source_kind === 'managed_global' && descriptor.tier === 'global' && descriptor.scope_id === null && mirror.scope_id === null && member.path === `rules/${descriptor.agent}/${descriptor.slug}.md`;
  const project = descriptor.source_kind === 'managed_project' && descriptor.tier === 'project' && /^[a-f0-9]{24,64}$/.test(mirror.scope_id) && descriptor.scope_id === mirror.scope_id && member.path === `pidex/rules/managed/${descriptor.agent}/${descriptor.slug}.md`;
  if ((!global && !project) || member.path !== member.path.toLowerCase()) return undefined;
  return { rule_id: descriptor.rule_id, version_hash: descriptor.rule_version, source: member.path, source_kind: descriptor.source_kind, provenance: 'verified_mirror', owner: descriptor.owner, scope: descriptor.tier, protected_class: descriptor.protection_class, capabilities: [], lifecycle_state: descriptor.lifecycle_state, bytes: member.bytes, descriptor };
}

function collectManagedMirrorDescriptors(mirror, descriptors, diagnostics) {
  if (mirror === undefined) return;
  if (!mirror || !Array.isArray(mirror.members)) { diagnostic(diagnostics, 'managed_mirror_invalid', 'pidex/rules/managed'); return; }
  const ruleIds = new Set();
  for (const member of mirror.members) {
    const descriptor = managedMirrorDescriptor(mirror, member);
    if (!descriptor || ruleIds.has(descriptor.rule_id)) { diagnostic(diagnostics, 'managed_mirror_invalid', typeof member?.path === 'string' ? member.path : 'pidex/rules/managed'); continue; }
    ruleIds.add(descriptor.rule_id);
    descriptors.push(descriptor);
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
  if (existing.source_kind === 'module' || descriptor.source_kind === 'module' || existing.source_kind === 'legacy_module' || descriptor.source_kind === 'legacy_module') {
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
export function reconcileRuleInventory({ root, projectRoot = root, gitTrackedPaths, operationHook, managedMirror, projectScopeId = managedMirror?.scope_id, immutableAuthority = false } = {}) {
  const absoluteRoot = path.resolve(root || '.');
  const diagnostics = [];
  const tracked = trackedCanonicalPaths(absoluteRoot, gitTrackedPaths, diagnostics);
  const projectTracked = immutableAuthority && path.resolve(projectRoot) !== absoluteRoot
    ? trackedCanonicalPaths(projectRoot, undefined, diagnostics)
    : new Set();
  const discoveredCandidates = new Set();
  const descriptors = [];
  // Fresh runtime bootstrap needs one exact authority across root agents, rules, and modules.
  // A verified Git object provides that coherent immutable root; bundled seed remains
  // admission data, not a competing runtime byte authority.
  const authority = immutableAuthority ? { packaged: gitObjectAuthority(absoluteRoot, operationHook), project: gitObjectAuthority(projectRoot, operationHook), module: gitObjectAuthority(absoluteRoot, operationHook) } : undefined;
  collectRootSources(absoluteRoot, projectRoot, discoveredCandidates, descriptors, diagnostics, operationHook, projectScopeId, authority);
  collectModuleSources(absoluteRoot, discoveredCandidates, descriptors, diagnostics, operationHook, authority?.module);
  collectManagedMirrorDescriptors(managedMirror, descriptors, diagnostics);
  reportCandidateMismatch(discoveredCandidates, new Set([...tracked, ...projectTracked]), diagnostics);
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
