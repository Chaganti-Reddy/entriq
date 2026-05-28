import type { MiddlewareHandler } from 'hono';
import { verify } from 'jsonwebtoken';
import type { JWTPayload } from '@entriq/shared';
import type { AppEnv } from '../types/index.js';

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization header missing or invalid' }, 401);
  }

  const token = authHeader.slice(7);
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) return c.json({ error: 'Server misconfiguration' }, 500);

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
