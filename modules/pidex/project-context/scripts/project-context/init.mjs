#!/usr/bin/env node
// Initialize PIDEX project context templates. Node implementation for cross-platform use.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const TEMPLATE_ROOT = path.join(ROOT, 'templates', 'project-context');

function usage() {
  console.log(`Usage: init.mjs <project> [--multi] [--context-name NAME] [--force]\n\nInitialize <project-root>/pidex/context templates.`);
}

function parseArgs(argv) {
  const args = { project: '', multi: false, contextName: 'Example', force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--multi') args.multi = true;
    else if (arg === '--context-name') args.contextName = argv[++i] || '';
    else if (arg === '--force') args.force = true;
    else if (arg === '-h' || arg === '--help') { usage(); process.exit(0); }
    else if (!args.project) args.project = arg;
    else { console.error(`Unknown arg: ${arg}`); process.exit(2); }
  }
  if (!args.project) { usage(); process.exit(2); }
  return args;
}

function expandHome(value) {
  return String(value).replace(/^~(?=$|[\\/])/, os.homedir());
}

function render(text, project, contextName = 'Example') {
  return text
    .replaceAll('__PROJECT_NAME__', path.basename(project))
    .replaceAll('__PROJECT_ROOT__', project)
    .replaceAll('__CONTEXT_NAME__', contextName)
    .replaceAll('__DATE__', new Date().toISOString().slice(0, 10));
}

function writeTemplate(src, dest, project, { force, contextName = 'Example' }) {
  if (existsSync(dest) && !force) {
    console.log(`skip existing: ${dest}`);
    return false;
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, render(readFileSync(src, 'utf8'), project, contextName), 'utf8');
  console.log(`wrote: ${dest}`);
  return true;
}

function slugContextName(value) {
  return String(value || '').trim().toLowerCase().replaceAll(' ', '-') || 'example';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const project = path.resolve(expandHome(args.project));
  if (!existsSync(project) || !statSync(project).isDirectory()) {
    console.error(`error: project root does not exist or is not a directory: ${project}`);
    return 2;
  }
  if (!existsSync(TEMPLATE_ROOT)) {
    console.error(`error: template root missing: ${TEMPLATE_ROOT}`);
    return 2;
  }
  const contextRoot = path.join(project, 'pidex', 'context');
  if (args.multi) {
    const contextSlug = slugContextName(args.contextName);
    writeTemplate(path.join(TEMPLATE_ROOT, 'CONTEXT-MAP.md'), path.join(contextRoot, 'CONTEXT-MAP.md'), project, { force: args.force });
    writeTemplate(path.join(TEMPLATE_ROOT, 'contexts', 'example', 'CONTEXT.md'), path.join(contextRoot, 'contexts', contextSlug, 'CONTEXT.md'), project, { force: args.force, contextName: args.contextName });
  } else {
    writeTemplate(path.join(TEMPLATE_ROOT, 'CONTEXT.md'), path.join(contextRoot, 'CONTEXT.md'), project, { force: args.force });
  }
  const readmeSrc = path.join(TEMPLATE_ROOT, 'README.md');
  if (existsSync(readmeSrc)) {
    mkdirSync(contextRoot, { recursive: true });
    const dest = path.join(contextRoot, 'README.template.md');
    copyFileSync(readmeSrc, dest);
    console.log(`wrote: ${dest}`);
  }
  return 0;
}

process.exitCode = main();
