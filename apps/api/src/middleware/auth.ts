import type { MiddlewareHandler } from 'hono';
import { jwtVerify, errors as joseErrors } from 'jose';
import type { JWTPayload } from '@entriq/shared';
import type { AppEnv } from '../types/index.js';
import { getEnv } from '../lib/env.js';

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization header missing or invalid' }, 401);
  }

  const token = authHeader.slice(7);
  const secret = getEnv('JWT_SECRET');
  if (!secret) return c.json({ error: 'Server misconfiguration' }, 500);

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    c.set('user', payload as unknown as JWTPayload);
    await next();
  } catch (err: unknown) {
    if (err instanceof joseErrors.JWTExpired) return c.json({ error: 'Token expired' }, 401);
    if (err instanceof joseErrors.JWTInvalid) return c.json({ error: 'Invalid token' }, 401);
    return c.json({ error: 'Authentication failed' }, 401);
  }
};
