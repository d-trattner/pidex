import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createFileRoute } from '@tanstack/react-router';

import { queryRows } from '../../lib/server/db';
import { errorResponse, jsonResponse } from '../../lib/server/response';

interface ProjectRow { name: string; path: string }
type TreeNode = { name: string; path: string; type: 'dir' | 'file'; children?: TreeNode[] };

async function projectPath(project: string | null): Promise<string | null> {
  if (!project) return null;
  const rows = await queryRows<ProjectRow>(
    'SELECT p.path FROM projects p WHERE p.name = ? OR p.path = ? LIMIT 1',
    [project, project],
  );
  return rows[0]?.path || null;
}

function safeJoin(root: string, rel: string): string | null {
  if (!rel || rel.startsWith('/') || rel.includes('..')) return null;
  const target = path.resolve(path.join(root, rel));
  if (!target.startsWith(path.resolve(root))) return null;
  return target;
}

async function rootDirs(projectRoot: string): Promise<Array<{ name: string; abs: string }>> {
  const roots: Array<{ name: string; abs: string }> = [];
  for (const entry of await fs.readdir(projectRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'agents.output' || entry.name === 'wiki' || entry.name.startsWith('agents.wiki.')) {
      roots.push({ name: entry.name, abs: path.join(projectRoot, entry.name) });
    }
  }
  roots.sort((a, b) => a.name.localeCompare(b.name));
  return roots;
}

async function buildTree(abs: string, rel: string, budget: { count: number }): Promise<TreeNode | null> {
  if (budget.count > 2000) return null;
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) return null;
  if (stat.isFile()) {
    if (!abs.endsWith('.md')) return null;
    budget.count += 1;
    return { name: path.basename(abs), path: rel, type: 'file' };
  }
  if (!stat.isDirectory()) return null;

  const children: TreeNode[] = [];
  const entries = await fs.readdir(abs, { withFileTypes: true }).catch(() => []);
  const sorted = entries
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist')
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

  for (const entry of sorted) {
    const childAbs = path.join(abs, entry.name);
    const childRel = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) {
      const node = await buildTree(childAbs, childRel, budget);
      if (node && node.children && node.children.length > 0) children.push(node);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const node = await buildTree(childAbs, childRel, budget);
      if (node) children.push(node);
    }
  }
  budget.count += 1;
  return { name: path.basename(abs), path: rel, type: 'dir', children };
}

export const Route = createFileRoute('/api/md-browser')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams;
        const project = query.get('project');
        const requestedPath = query.get('path');
        const root = await projectPath(project);
        if (!root) return errorResponse('unknown project', 404);

        if (requestedPath) {
          const resolved = safeJoin(root, requestedPath);
          if (!resolved || !resolved.endsWith('.md')) return errorResponse('document not found', 404);
          try {
            const markdown = await fs.readFile(resolved, 'utf-8');
            return jsonResponse({ project, path: requestedPath, absolute_path: resolved, markdown });
          } catch {
            return errorResponse('document not found', 404);
          }
        }

        const tree: TreeNode[] = [];
        for (const rootDir of await rootDirs(root)) {
          const budget = { count: 0 };
          const node = await buildTree(rootDir.abs, rootDir.name, budget);
          if (node) tree.push(node);
        }
        return jsonResponse({ project, root, tree });
      },
    },
  },
});
