export interface ProviderLimitsAuthResult {
  allowed: boolean;
  status?: number;
  error?: string;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function hasValidToken(request: Request): boolean {
  const expected = process.env.PIDEX_PROVIDER_LIMITS_TOKEN || process.env.PROVIDER_LIMITS_TOKEN;
  if (!expected) return false;

  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim() === expected;
  }

  const headerToken = request.headers.get('x-provider-limits-token') || request.headers.get('x-pidex-provider-limits-token');
  return (headerToken || '').trim() === expected;
}

function isSameOrigin(requestUrl: URL, origin: string): boolean {
  try {
    const originUrl = new URL(origin);
    return originUrl.protocol === requestUrl.protocol
      && originUrl.hostname === requestUrl.hostname
      && originUrl.port === requestUrl.port;
  } catch {
    return false;
  }
}

export function authorizeProviderLimitsRequest(request: Request, options: { method: string }): ProviderLimitsAuthResult {
  const requestUrl = new URL(request.url);
  const isLocal = isLoopbackHost(requestUrl.hostname);

  if (!isLocal && !hasValidToken(request)) {
    return { allowed: false, status: 403, error: 'provider-limits access denied' };
  }

  if (options.method.toUpperCase() !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && !isSameOrigin(requestUrl, origin)) {
      return { allowed: false, status: 403, error: 'cross-origin provider-limits write denied' };
    }
  }

  return { allowed: true };
}
