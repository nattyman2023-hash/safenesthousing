import { createHash } from 'node:crypto';

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_MEMORY_KEYS = 10_000;

export function getClientIp(request: Pick<Request, 'headers'>): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = request.headers.get('x-real-ip')?.trim() || forwarded || request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
  return address.slice(0, 100) || 'unknown';
}

function pruneExpired(now: number) {
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key);
  }
  if (attempts.size <= MAX_MEMORY_KEYS) return;
  const oldest = [...attempts.entries()].sort((left, right) => left[1].resetAt - right[1].resetAt);
  for (const [key] of oldest.slice(0, attempts.size - MAX_MEMORY_KEYS)) attempts.delete(key);
}

function memoryRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    if (attempts.size > MAX_MEMORY_KEYS) pruneExpired(now);
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

function rateLimitKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

async function httpRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const url = process.env.RATE_LIMIT_URL;
  const token = process.env.RATE_LIMIT_TOKEN;
  if (!url || !token) return { allowed: false, retryAfter: 60 };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rate-Limit-Token': token },
      body: JSON.stringify({ key: rateLimitKey(key), limit, windowMs }),
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) return { allowed: false, retryAfter: 60 };
    const result = await response.json() as { allowed?: unknown; retryAfter?: unknown };
    if (typeof result.allowed !== 'boolean') return { allowed: false, retryAfter: 60 };
    return { allowed: result.allowed, retryAfter: typeof result.retryAfter === 'number' ? Math.max(0, Math.ceil(result.retryAfter)) : result.allowed ? 0 : 60 };
  } catch {
    return { allowed: false, retryAfter: 60 };
  }
}

export async function rateLimit(key: string, limit = 8, windowMs = 60_000): Promise<{ allowed: boolean; retryAfter: number }> {
  const provider = process.env.RATE_LIMIT_PROVIDER ?? 'memory';
  if (provider === 'memory') return memoryRateLimit(key, limit, windowMs);
  if (provider === 'http') return httpRateLimit(key, limit, windowMs);
  return { allowed: false, retryAfter: 60 };
}

export function rateLimitAdapterStatus(environment: NodeJS.ProcessEnv = process.env) {
  const provider = environment.RATE_LIMIT_PROVIDER ?? 'memory';
  return { provider, configured: provider === 'memory' || (provider === 'http' && !!environment.RATE_LIMIT_URL && !!environment.RATE_LIMIT_TOKEN), failClosed: provider !== 'memory' };
}
