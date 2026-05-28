// apps/api/src/middleware/auth.ts
// JWT authentication middleware — verifies Bearer token and attaches user payload to context.

import type { MiddlewareHandler } from 'hono';
import { verify } from 'jsonwebtoken';
import type { JWTPayload } from '@entriq/shared';
import type { AppEnv } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET environment variable');
}

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization header missing or invalid' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = verify(token, JWT_SECRET) as JWTPayload;
    c.set('user', payload);
    await next();
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'TokenExpiredError') return c.json({ error: 'Token expired' }, 401);
      if (err.name === 'JsonWebTokenError') return c.json({ error: 'Invalid token' }, 401);
    }
    return c.json({ error: 'Authentication failed' }, 401);
  }
};
