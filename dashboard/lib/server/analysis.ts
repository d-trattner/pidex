import { promises as fs } from 'node:fs';
import path from 'node:path';

import { PIDEX_ROOT } from './paths';

interface JsonObjectLike {
  [key: string]: unknown;
}

const ROOT = PIDEX_ROOT;
const ANALYSIS_DIR = path.resolve(ROOT, 'analysis');

function toPosix(value: string): string {
  return value.replace(/\\+/g, '/');
}

function readMeta(text: string, field: string): string | null {
  const key = `- ${field.toLowerCase()}:`;
  for (const line of text.split('\n')) {
    if (line.toLowerCase().startsWith(key)) {
      return line.slice(key.length).trim();
    }
  }
  return null;
}

function extractPlanKey(fileName: string): string | null {
  const clean = path.basename(fileName).replace(/\.md$/i, '');
  const match = clean.match(/plan-([^./]+)$/i);
  return match?.[1] ? `plan-${match[1]}` : null;
}

function ensureInside(relativePath: string): string {
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error('path traversal');
  }
  const full = path.resolve(ANALYSIS_DIR, normalized);
  if (!full.startsWith(ANALYSIS_DIR)) {
    throw new Error('path traversal');
  }
  return full;
}

async function walkMarkdownFiles(base: string, out: string[] = []): Promise<string[]> {
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(base, entry.name);
      if (entry.isDirectory()) {
        out.push(...await walkMarkdownFiles(next, []));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(next);
      }
    }
  } catch {
    // ignore unavailable analysis folders
  }
  return out;
}

async function scan(kind: 'pipeline-analysis' | 'plans'): Promise<JsonObjectLike[]> {
  const base = kind === 'plans' ? path.resolve(ANALYSIS_DIR, 'plans') : ANALYSIS_DIR;
  const files = await walkMarkdownFiles(base);
  const out: JsonObjectLike[] = [];

  for (const file of files) {
    const relative = path.relative(ANALYSIS_DIR, file);
    if (kind === 'pipeline-analysis' && !path.basename(file).endsWith('-pipeline-analysis.md')) continue;
    if (kind === 'plans' && !path.relative(ANALYSIS_DIR, file).startsWith('plans/')) continue;

    let markdown = '';
    try {
      markdown = await fs.readFile(file, 'utf-8');
    } catch {
      continue;
    }

    const stat = await fs.stat(file).catch(() => null);
    const mtime = stat ? new Date(stat.mtime).toISOString() : new Date().toISOString();

    const projectSlug = readMeta(markdown, 'project') || null;
    const title = readMeta(markdown, 'title') || path.basename(file, '.md');
    const verdict = readMeta(markdown, 'verdict');
    const confidence = readMeta(markdown, 'confidence');

    out.push({
      path: toPosix(relative),
      title,
      project_slug: projectSlug,
      plan_key: extractPlanKey(file),
      verdict,
      confidence,
      updated: mtime,
      mtime,
    });
  }

  return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

export async function listAnalysis(kind: 'pipeline-analysis' | 'plans'): Promise<JsonObjectLike[]> {
  return scan(kind);
}

export async function readAnalysisDocument(relativePath: string): Promise<JsonObjectLike | null> {
  try {
    const absolute = ensureInside(relativePath);
    const markdown = await fs.readFile(absolute, 'utf-8');
    return {
      path: toPosix(path.relative(ANALYSIS_DIR, absolute)),
      markdown,
    };
  } catch {
    return null;
  }
}

export async function resolveProjectDocumentFromPlan(projectRoot: string, planKey?: string | null): Promise<string | null> {
  if (!projectRoot || !planKey) {
    return null;
  }
  const normalized = String(planKey).replace(/^plan-/, '').trim();
  const candidates = [
    path.join(projectRoot, 'agents.output', `plan-${normalized}.md`),
    path.join(projectRoot, 'agents.output', `${normalized}.md`),
    path.join(projectRoot, 'agents.output', `plan-${normalized}-analysis.md`),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

export { ANALYSIS_DIR };
