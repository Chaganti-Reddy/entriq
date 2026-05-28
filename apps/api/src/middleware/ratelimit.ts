// apps/api/src/middleware/ratelimit.ts
// Rate limiting middleware using Upstash Redis.
// Prevents abuse on public endpoints.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { MiddlewareHandler } from 'hono';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// Gracefully degrade: if Upstash is not configured, skip rate limiting.
// This allows local dev without Upstash setup.
const redis = url && token ? new Redis({ url, token }) : null;

/**
 * Creates a rate limiter middleware.
 *
 * @param requests - Number of allowed requests
 * @param window   - Time window (e.g. '1 h', '1 m')
 * @param prefix   - Redis key prefix to separate different limiters
 */
export function rateLimiter(
  requests: number,
  window: `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`,
  prefix: string
): MiddlewareHandler {
  if (!redis) {
    // No Redis configured — pass through (dev mode)
    return async (_c, next) => await next();
  }

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `entriq:${prefix}`,
  });

  return async (c, next) => {
    // Use X-Forwarded-For first (for proxied requests on Railway/Vercel),
    // then fall back to the direct connection IP.
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';

    const { success, limit, remaining, reset } = await limiter.limit(ip);

    // Always set rate limit headers so clients can adapt
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(reset));

    if (!success) {
      return c.json(
        {
          error: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
        },
        429
      );
    }

    await next();
  };
}

// Pre-built limiters for specific routes
export const registrationLimiter = rateLimiter(5, '1 h', 'registration');
export const checkinLimiter = rateLimiter(20, '1 m', 'checkin');
export const authLimiter = rateLimiter(10, '15 m', 'auth');
