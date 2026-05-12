function asSearchString(search: unknown): string {
  if (!search) return '';
  if (typeof search === 'string') return search;
  if (typeof search === 'object') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search as Record<string, unknown>)) {
      if (value == null || value === '') continue;
      params.set(key, String(value));
    }
    const query = params.toString();
    return query ? `?${query}` : '';
  }
  return '';
}

export function withProjectParam(endpoint: string, project: string): string {
  const [path, rawQuery = ''] = endpoint.split('?');
  const params = new URLSearchParams(rawQuery);
  const cleaned = project.trim();
  if (cleaned) {
    params.set('project', cleaned);
  } else {
    params.delete('project');
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function setProjectInSearch(search: unknown, project: string): string {
  const normalized = asSearchString(search);
  const params = new URLSearchParams(normalized.startsWith('?') ? normalized.slice(1) : normalized);
  const cleaned = project.trim();
  if (cleaned) {
    params.set('project', cleaned);
  } else {
    params.delete('project');
  }
  params.delete('page');
  params.delete('page_week');
  params.delete('page_month');
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function readProjectFromSearch(search: unknown): string {
  const normalized = asSearchString(search);
  const params = new URLSearchParams(normalized.startsWith('?') ? normalized.slice(1) : normalized);
  return (params.get('project') || '').trim();
}

export function readPageForKey(search: unknown, key: string): number {
  const normalized = asSearchString(search);
  const params = new URLSearchParams(normalized.startsWith('?') ? normalized.slice(1) : normalized);
  const raw = Number.parseInt(params.get(key) || '0', 10);
  return Number.isNaN(raw) || raw < 0 ? 0 : raw;
}

export function readPageFromSearch(search: unknown): number {
  return readPageForKey(search, 'page');
}

export function setPageForKey(search: unknown, key: string, page: number): string {
  const normalized = asSearchString(search);
  const params = new URLSearchParams(normalized.startsWith('?') ? normalized.slice(1) : normalized);
  params.set(key, String(Math.max(0, page)));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function toSearchString(search: unknown): string {
  return asSearchString(search);
}
