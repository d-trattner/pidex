import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createFileRoute } from '@tanstack/react-router';

import { DEFAULT_CONTEXT_MARKDOWN, approveOpenQuestion, normalizeRawContext, parseContextMarkdown, safeContextTarget, serializeStructuredContext, type ContextEntry } from '../../lib/server/context-md';
import { queryRows } from '../../lib/server/db';
import { errorResponse, jsonResponse } from '../../lib/server/response';

interface ProjectRow { name: string; path: string }

type ContextPayload = ReturnType<typeof toPayload>;

async function projectPath(project: string | null): Promise<string | null> {
  if (!project) return null;
  const rows = await queryRows<ProjectRow>(
    'SELECT p.path FROM projects p WHERE p.name = ? OR p.path = ? LIMIT 1',
    [project, project],
  );
  return rows[0]?.path || null;
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function sameOrigin(requestUrl: URL, origin: string | null): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === requestUrl.protocol && parsed.hostname === requestUrl.hostname && parsed.port === requestUrl.port;
  } catch {
    return false;
  }
}

function authorizeContextWrite(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && !sameOrigin(url, origin)) {
    return { ok: false, status: 403, error: 'cross-origin context write denied' };
  }
  if (!isLoopback(url.hostname) && !origin) {
    return { ok: false, status: 403, error: 'context write requires same-origin browser request' };
  }
  return { ok: true };
}

async function readContext(projectRoot: string) {
  const safe = safeContextTarget(projectRoot);
  if (!safe) throw new Error('invalid context path');
  const stat = await fs.stat(safe.target).catch(() => null);
  if (!stat) {
    const parsed = parseContextMarkdown('', null);
    return { safe, exists: false, parsed };
  }
  const raw = await fs.readFile(safe.target, 'utf-8');
  return { safe, exists: true, parsed: parseContextMarkdown(raw, stat.mtimeMs) };
}

function toPayload(args: { project: string | null; projectRoot: string | null; contextPath?: string; exists?: boolean; parsed?: ReturnType<typeof parseContextMarkdown>; extra?: Record<string, unknown> }) {
  const parsed = args.parsed;
  return {
    ok: true,
    project: args.project,
    project_root: args.projectRoot,
    project_required: !args.projectRoot,
    exists: Boolean(args.exists),
    path: args.contextPath,
    raw: parsed?.raw ?? '',
    entries: parsed?.entries ?? [],
    openQuestions: parsed?.openQuestions ?? [],
    structuredEditable: parsed?.structuredEditable ?? true,
    hash: parsed?.hash,
    mtimeMs: parsed?.mtimeMs ?? null,
    errors: parsed?.errors ?? [],
    ...(args.extra || {}),
  };
}

async function payloadForRequest(request: Request): Promise<ContextPayload | Response> {
  const query = new URL(request.url).searchParams;
  const project = query.get('project');
  const root = await projectPath(project);
  if (!root) return toPayload({ project, projectRoot: null });
  const current = await readContext(root);
  return toPayload({ project, projectRoot: root, contextPath: current.safe.target, exists: current.exists, parsed: current.parsed });
}

async function writeAtomic(target: string, raw: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = path.join(path.dirname(target), `.CONTEXT.md.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, raw, 'utf-8');
  await fs.rename(tmp, target);
}

export const Route = createFileRoute('/api/context')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const payload = await payloadForRequest(request);
        return payload instanceof Response ? payload : jsonResponse(payload);
      },
      POST: async ({ request }) => {
        const auth = authorizeContextWrite(request);
        if (!auth.ok) return errorResponse(auth.error, auth.status);

        const query = new URL(request.url).searchParams;
        const project = query.get('project');
        const root = await projectPath(project);
        if (!root) return errorResponse('project is required', 400);
        const current = await readContext(root);
        const body = (await request.json().catch(() => ({}))) as { action?: string; hash?: string; entries?: ContextEntry[]; raw?: string; questionIndex?: number };
        const action = body.action || 'save-entries';

        if (action !== 'create' && body.hash && body.hash !== current.parsed.hash) {
          return jsonResponse(toPayload({ project, projectRoot: root, contextPath: current.safe.target, exists: current.exists, parsed: current.parsed, extra: { stale_write: true } }), 409);
        }

        if (action === 'create') {
          if (current.exists) return errorResponse('context already exists', 409);
          await writeAtomic(current.safe.target, DEFAULT_CONTEXT_MARKDOWN);
        } else if (action === 'save-raw') {
          const normalized = normalizeRawContext(String(body.raw || ''));
          const blockingErrors = normalized.parsed.errors.filter((error) => /Duplicate term|definition is required|term is required/i.test(error));
          if (blockingErrors.length) return jsonResponse({ ok: false, errors: blockingErrors }, 400);
          await writeAtomic(current.safe.target, normalized.raw);
        } else if (action === 'save-entries') {
          const result = serializeStructuredContext(current.parsed, Array.isArray(body.entries) ? body.entries : []);
          if (result.errors.length || !result.raw) return jsonResponse({ ok: false, errors: result.errors }, 400);
          await writeAtomic(current.safe.target, result.raw);
        } else if (action === 'approve-open-question') {
          const result = approveOpenQuestion(current.parsed.raw, Number(body.questionIndex));
          if (result.errors.length || !result.raw) return jsonResponse({ ok: false, errors: result.errors }, 400);
          await writeAtomic(current.safe.target, result.raw);
        } else {
          return errorResponse('unknown context action', 400);
        }

        const next = await readContext(root);
        return jsonResponse(toPayload({ project, projectRoot: root, contextPath: next.safe.target, exists: next.exists, parsed: next.parsed }));
      },
    },
  },
});
