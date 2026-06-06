#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveContained } from './policy.mjs';

export function parseExtractArgs(argv) {
  const out = { workspace: '', project: process.cwd(), assigned: [], runId: '', check: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace') out.workspace = argv[++i] || '';
    else if (arg === '--project') out.project = argv[++i] || '';
    else if (arg === '--assigned') out.assigned.push(argv[++i] || '');
    else if (arg === '--run-id') out.runId = argv[++i] || '';
    else if (arg === '--check') out.check = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function normalizeAssigned(p) {
  const rel = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!rel.startsWith('agents.output/')) throw new Error(`assigned artifact must be under agents.output/: ${p}`);
  if (rel.includes('..')) throw new Error(`assigned artifact path must not contain traversal: ${p}`);
  return rel;
}

export function preflightArtifacts(options = {}) {
  const workspace = path.resolve(options.workspace || '');
  const project = path.resolve(options.project || '.');
  const assigned = (options.assigned || []).map(normalizeAssigned);
  const missing = [];
  const collisions = [];
  const ready = [];
  for (const rel of assigned) {
    const src = resolveContained(workspace, rel);
    const dest = resolveContained(project, rel);
    if (!existsSync(src)) { missing.push(rel); continue; }
    if (existsSync(dest)) { collisions.push(rel); continue; }
    ready.push({ source: src, destination: dest, path: rel });
  }
  if (missing.length) return { ok: false, reason: 'assigned-artifact-missing', missing, collisions, ready, assigned };
  if (collisions.length) return { ok: false, reason: 'artifact-target-collision', missing, collisions, ready, assigned };
  return { ok: true, missing, collisions, ready, assigned };
}

export function extractArtifacts(options = {}) {
  const check = preflightArtifacts(options);
  if (!check.ok || options.check) return { ...check, check_only: Boolean(options.check), copied: [] };
  const copied = [];
  for (const item of check.ready) {
    mkdirSync(path.dirname(item.destination), { recursive: true });
    copyFileSync(item.source, item.destination);
    copied.push(item);
  }
  return { ok: true, copied, missing: [], assigned: check.assigned };
}

function usage() { return 'Usage: extract-artifacts.mjs --workspace PATH --project PATH --assigned agents.output/path.md [--assigned ...] [--check] --json'; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseExtractArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = extractArtifacts(args);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
